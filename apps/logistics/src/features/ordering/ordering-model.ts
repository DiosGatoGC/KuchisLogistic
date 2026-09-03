import type {
  CatalogCategory,
  CatalogProduct,
  CreateOrderInput,
  DraftAddition,
  DraftLine,
  DraftOrder,
  PersistedDraftOrder,
  ServiceSessionOrderStatus,
} from "./ordering-types";

export const ADDITIONS_CATEGORY_SLUG = "adicionales";
export const EMPTY_DRAFT: DraftOrder = { notes: "", lines: [] };
export const MAX_ORDER_LINES = 100;
export const MAX_ITEM_QUANTITY = 1000;
export const MAX_ADDITION_QUANTITY = 100;
export const MAX_NOTES_LENGTH = 500;

const priceFormatter = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number) {
  return `S/ ${priceFormatter.format(value)}`;
}

export function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE")
    .trim();
}

export function publicCategories(categories: readonly CatalogCategory[]) {
  return categories
    .filter((category) => category.slug !== ADDITIONS_CATEGORY_SLUG)
    .toSorted((a, b) => a.sortOrder - b.sortOrder);
}

export function mainProducts(
  products: readonly CatalogProduct[],
  categories: readonly CatalogCategory[],
) {
  const additionsCategoryId = categories.find(
    (category) => category.slug === ADDITIONS_CATEGORY_SLUG,
  )?.id;
  return products.filter((product) => product.categoryId !== additionsCategoryId);
}

export function productCanBeAdded(
  product: CatalogProduct,
  categories: readonly CatalogCategory[],
) {
  const additionsCategoryId = categories.find(
    (category) => category.slug === ADDITIONS_CATEGORY_SLUG,
  )?.id;
  return product.isAvailable && product.categoryId !== additionsCategoryId;
}

export function visibleProducts(
  products: readonly CatalogProduct[],
  categories: readonly CatalogCategory[],
  categorySlug: string,
  search: string,
) {
  const categoryId = categories.find(
    (category) => category.slug === categorySlug,
  )?.id;
  const query = normalizedText(search);

  return mainProducts(products, categories).filter((product) => {
    if (categorySlug !== "all" && product.categoryId !== categoryId) return false;
    if (!query) return true;
    return normalizedText(`${product.name} ${product.description ?? ""}`).includes(query);
  });
}

function normalizedNote(value?: string) {
  const note = value?.trim() ?? "";
  return note || undefined;
}

export function normalizedAdditions(additions: readonly DraftAddition[]) {
  return additions
    .filter((addition) => addition.quantityPerItem > 0)
    .toSorted((a, b) => a.productId.localeCompare(b.productId));
}

export function createDraftLine({
  id,
  product,
  quantity = 1,
  notes,
  additions = [],
}: {
  id: string;
  product: CatalogProduct;
  quantity?: number;
  notes?: string;
  additions?: DraftAddition[];
}): DraftLine {
  return {
    id,
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity,
    notes: normalizedNote(notes),
    additions: normalizedAdditions(additions),
  };
}

export function linesAreEquivalent(a: DraftLine, b: DraftLine) {
  if (a.productId !== b.productId || normalizedNote(a.notes) !== normalizedNote(b.notes)) {
    return false;
  }
  const left = normalizedAdditions(a.additions);
  const right = normalizedAdditions(b.additions);
  return (
    left.length === right.length &&
    left.every(
      (addition, index) =>
        addition.productId === right[index]?.productId &&
        addition.quantityPerItem === right[index]?.quantityPerItem,
    )
  );
}

export function addProduct(draft: DraftOrder, line: DraftLine): DraftOrder {
  if (line.invalidReason || line.quantity < 1 || line.quantity > MAX_ITEM_QUANTITY) {
    return draft;
  }
  const equivalentIndex = draft.lines.findIndex((current) =>
    linesAreEquivalent(current, line),
  );
  if (equivalentIndex < 0) {
    if (draft.lines.length >= MAX_ORDER_LINES) return draft;
    return { ...draft, lines: [...draft.lines, line] };
  }
  const current = draft.lines[equivalentIndex];
  if (current.quantity + line.quantity > MAX_ITEM_QUANTITY) return draft;
  return {
    ...draft,
    lines: draft.lines.map((item, index) =>
      index === equivalentIndex
        ? { ...item, quantity: item.quantity + line.quantity }
        : item,
    ),
  };
}

export function replaceDraftLine(
  draft: DraftOrder,
  lineId: string,
  replacement: DraftLine,
): DraftOrder {
  const withoutLine = draft.lines.filter((line) => line.id !== lineId);
  const base = { ...draft, lines: withoutLine };
  const result = addProduct(base, replacement);
  return result === base ? draft : result;
}

export function updateLineQuantity(
  draft: DraftOrder,
  lineId: string,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    return draft;
  }
  return {
    ...draft,
    lines: draft.lines.map((line) =>
      line.id === lineId ? { ...line, quantity } : line,
    ),
  };
}

export function removeDraftLine(draft: DraftOrder, lineId: string) {
  return { ...draft, lines: draft.lines.filter((line) => line.id !== lineId) };
}

export function lineTotal(line: DraftLine) {
  const additions = line.additions.reduce(
    (sum, addition) => sum + addition.unitPrice * addition.quantityPerItem,
    0,
  );
  return (line.unitPrice + additions) * line.quantity;
}

export function draftTotal(draft: DraftOrder) {
  return draft.lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function validateDraft(
  draft: DraftOrder,
  sessionStatus: ServiceSessionOrderStatus,
) {
  const errors: string[] = [];
  if (sessionStatus !== "OPEN") errors.push("La atención ya no está abierta.");
  if (draft.lines.length < 1) errors.push("Agrega al menos un producto.");
  if (draft.lines.length > MAX_ORDER_LINES) errors.push("La comanda supera las 100 líneas.");
  if (draft.notes.trim().length > MAX_NOTES_LENGTH) {
    errors.push("La nota general no puede superar los 500 caracteres.");
  }
  for (const line of draft.lines) {
    if (line.invalidReason) errors.push(`${line.productName}: ${line.invalidReason}`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_ITEM_QUANTITY) {
      errors.push(`${line.productName}: cantidad inválida.`);
    }
    if ((line.notes?.trim().length ?? 0) > MAX_NOTES_LENGTH) {
      errors.push(`${line.productName}: la nota supera los 500 caracteres.`);
    }
    if (line.additions.length > 50) errors.push(`${line.productName}: demasiados adicionales.`);
    const additionIds = new Set<string>();
    for (const addition of line.additions) {
      if (additionIds.has(addition.productId)) {
        errors.push(`${line.productName}: adicional duplicado.`);
      }
      additionIds.add(addition.productId);
      if (
        !Number.isInteger(addition.quantityPerItem) ||
        addition.quantityPerItem < 1 ||
        addition.quantityPerItem > MAX_ADDITION_QUANTITY
      ) {
        errors.push(`${line.productName}: cantidad de adicional inválida.`);
      }
    }
  }
  return [...new Set(errors)];
}

export function createOrderPayload(draft: DraftOrder): CreateOrderInput {
  const notes = normalizedNote(draft.notes);
  return {
    ...(notes ? { notes } : {}),
    items: draft.lines.map((line) => {
      const itemNotes = normalizedNote(line.notes);
      return {
        productId: line.productId,
        quantity: line.quantity,
        ...(itemNotes ? { notes: itemNotes } : {}),
        additions: normalizedAdditions(line.additions).map((addition) => ({
          productId: addition.productId,
          quantityPerItem: addition.quantityPerItem,
        })),
      };
    }),
  };
}

export function persistedDraft(draft: DraftOrder): PersistedDraftOrder {
  return {
    version: 1,
    notes: draft.notes,
    lines: draft.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      quantity: line.quantity,
      ...(normalizedNote(line.notes) ? { notes: normalizedNote(line.notes) } : {}),
      additions: line.additions.map((addition) => ({
        productId: addition.productId,
        quantityPerItem: addition.quantityPerItem,
      })),
    })),
  };
}

export function restoreDraft(
  persisted: PersistedDraftOrder,
  products: readonly CatalogProduct[],
  additions: readonly CatalogProduct[],
): DraftOrder {
  const productById = new Map(products.map((product) => [product.id, product]));
  const additionById = new Map(additions.map((product) => [product.id, product]));
  return {
    notes: persisted.notes,
    lines: persisted.lines.flatMap((stored) => {
      const product = productById.get(stored.productId);
      if (!product) {
        return [{
          id: stored.id,
          productId: stored.productId,
          productName: "Producto ya no disponible",
          unitPrice: 0,
          quantity: stored.quantity,
          notes: normalizedNote(stored.notes),
          additions: [],
          invalidReason: "El producto ya no existe en el catálogo.",
        }];
      }
      const restoredAdditions = stored.additions.flatMap((storedAddition) => {
        const addition = additionById.get(storedAddition.productId);
        return [{
          productId: storedAddition.productId,
          name: addition?.name ?? "Adicional ya no disponible",
          unitPrice: addition?.price ?? 0,
          quantityPerItem: storedAddition.quantityPerItem,
          isAvailable: addition?.isAvailable ?? false,
        }];
      });
      return [createDraftLine({
        id: stored.id,
        product,
        quantity: stored.quantity,
        notes: stored.notes,
        additions: restoredAdditions,
      })];
    }),
  };
}

export function revalidateDraft(
  draft: DraftOrder,
  products: readonly CatalogProduct[],
  additions: readonly CatalogProduct[],
): DraftOrder {
  const productById = new Map(products.map((product) => [product.id, product]));
  const additionById = new Map(additions.map((product) => [product.id, product]));
  return {
    ...draft,
    lines: draft.lines.map((line) => {
      const product = productById.get(line.productId);
      let invalidReason: string | undefined;
      if (!product) invalidReason = "El producto ya no existe en el catálogo.";
      else if (additionById.has(line.productId)) {
        invalidReason = "El producto ya no puede pedirse como ítem principal.";
      }
      else if (!product.isAvailable) invalidReason = "El producto ya no está disponible.";
      else if (line.additions.length > 0 && !product.allowsAdditions) {
        invalidReason = "El producto ya no admite adicionales.";
      }

      const refreshedAdditions = line.additions.map((addition) => {
        const current = additionById.get(addition.productId);
        if (!current) invalidReason ??= "Un adicional ya no existe.";
        else if (!current.isAvailable) invalidReason ??= `${current.name} ya no está disponible.`;
        return current
          ? { ...addition, name: current.name, unitPrice: current.price, isAvailable: current.isAvailable }
          : { ...addition, isAvailable: false };
      });

      return {
        ...line,
        productName: product?.name ?? line.productName,
        unitPrice: product?.price ?? line.unitPrice,
        additions: refreshedAdditions,
        invalidReason,
      };
    }),
  };
}

export function draftAfterCreate(draft: DraftOrder, succeeded: boolean) {
  return succeeded ? EMPTY_DRAFT : draft;
}

export interface SubmitLock {
  current: boolean;
}

export async function runWithSubmitLock<T>(
  lock: SubmitLock,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await operation();
  } finally {
    lock.current = false;
  }
}
