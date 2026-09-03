import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addProduct,
  createDraftLine,
  createOrderPayload,
  draftAfterCreate,
  draftTotal,
  EMPTY_DRAFT,
  lineTotal,
  linesAreEquivalent,
  productCanBeAdded,
  publicCategories,
  revalidateDraft,
  replaceDraftLine,
  runWithSubmitLock,
  updateLineQuantity,
  validateDraft,
  visibleProducts,
} from "./ordering-model.ts";
import type {
  CatalogCategory,
  CatalogProduct,
  DraftAddition,
  DraftOrder,
} from "./ordering-types.ts";
import {
  clearStoredDraft,
  readStoredDraft,
  storeDraft,
  type DraftStorage,
} from "./ordering-storage.ts";
import { submitConfirmedOrder } from "./ordering-submit.ts";
import type { CreateOrderResult } from "./ordering-types.ts";
import {
  consumeOrderCreatedFeedback,
  orderCreatedMessage,
  storeOrderCreatedFeedback,
  type OrderCreatedFeedbackStorage,
} from "../../lib/order-created-feedback.ts";

const categories: CatalogCategory[] = [
  { id: "cat-2", name: "Adicionales", slug: "adicionales", sortOrder: 99 },
  { id: "cat-1", name: "Hamburguesas", slug: "hamburguesas", sortOrder: 1 },
  { id: "cat-3", name: "Bebidas", slug: "bebidas", sortOrder: 2 },
];

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    categoryId: "cat-1",
    name: "Hamburguesa clásica",
    description: "Carne y papas",
    price: 12,
    imagePath: "/ignored.jpg",
    isAvailable: true,
    preparationStation: "KITCHEN",
    allowsAdditions: false,
    ...overrides,
  };
}

function addition(overrides: Partial<DraftAddition> = {}): DraftAddition {
  return {
    productId: "addition-1",
    name: "Queso",
    unitPrice: 2,
    quantityPerItem: 1,
    isAvailable: true,
    ...overrides,
  };
}

function line(
  overrides: Partial<ReturnType<typeof createDraftLine>> = {},
) {
  return { ...createDraftLine({ id: "line-1", product: product() }), ...overrides };
}

function createdOrder(sequenceNumber = 7): CreateOrderResult {
  return {
    order: {
      id: "order-from-backend",
      sequenceNumber,
      notes: null,
      sentAt: "2026-09-03T10:00:00.000Z",
      session: { id: "session-a" },
      servicePoint: { id: "point-a", name: "Mesa 1" },
      createdBy: { id: "user-a", fullName: "Operador", role: "ADMIN" },
      items: [],
    },
  };
}

function memoryStorage(): OrderCreatedFeedbackStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("ordering model", () => {
  test("excludes adicionales and sorts public categories", () => {
    assert.deepEqual(publicCategories(categories).map(({ slug }) => slug), ["hamburguesas", "bebidas"]);
  });

  test("unavailable products cannot be added", () => {
    assert.equal(productCanBeAdded(product({ isAvailable: false }), categories), false);
  });

  test("products in adicionales cannot be main items", () => {
    assert.equal(productCanBeAdded(product({ categoryId: "cat-2" }), categories), false);
  });

  test("adds a product without additions", () => {
    const draft = addProduct(EMPTY_DRAFT, line());
    assert.equal(draft.lines.length, 1);
    assert.deepEqual(draft.lines[0]?.additions, []);
  });

  test("keeps additions on customizable products", () => {
    const custom = createDraftLine({
      id: "custom",
      product: product({ allowsAdditions: true }),
      additions: [addition()],
    });
    assert.equal(addProduct(EMPTY_DRAFT, custom).lines[0]?.additions[0]?.name, "Queso");
  });

  test("marks unavailable additions without deleting the line", () => {
    const draft = { ...EMPTY_DRAFT, lines: [line({ additions: [addition()] })] };
    const checked = revalidateDraft(
      draft,
      [product({ allowsAdditions: true })],
      [product({ id: "addition-1", name: "Queso", categoryId: "cat-2", isAvailable: false })],
    );
    assert.equal(checked.lines.length, 1);
    assert.match(checked.lines[0]?.invalidReason ?? "", /no está disponible/i);
  });

  test("merges equivalent lines", () => {
    const draft = addProduct(addProduct(EMPTY_DRAFT, line()), line({ id: "line-2" }));
    assert.equal(draft.lines.length, 1);
    assert.equal(draft.lines[0]?.quantity, 2);
  });

  test("different notes do not merge", () => {
    assert.equal(linesAreEquivalent(line({ notes: "Sin ají" }), line({ id: "2", notes: "Aparte" })), false);
  });

  test("equivalent notes are trimmed before merge", () => {
    assert.equal(linesAreEquivalent(line({ notes: " Sin ají " }), line({ id: "2", notes: "Sin ají" })), true);
  });

  test("different additions do not merge", () => {
    assert.equal(linesAreEquivalent(line({ additions: [addition()] }), line({ id: "2" })), false);
  });

  test("addition order does not affect equivalence", () => {
    const cheese = addition();
    const egg = addition({ productId: "addition-2", name: "Huevo" });
    assert.equal(
      linesAreEquivalent(line({ additions: [cheese, egg] }), line({ id: "2", additions: [egg, cheese] })),
      true,
    );
  });

  test("updates quantity inside bounds", () => {
    const draft = { ...EMPTY_DRAFT, lines: [line()] };
    assert.equal(updateLineQuantity(draft, "line-1", 3).lines[0]?.quantity, 3);
  });

  test("rejects quantity outside bounds", () => {
    const draft = { ...EMPTY_DRAFT, lines: [line()] };
    assert.equal(updateLineQuantity(draft, "line-1", 0), draft);
    assert.equal(updateLineQuantity(draft, "line-1", 1001), draft);
  });

  test("keeps the original line when an edited merge would exceed quantity bounds", () => {
    const original = line({ id: "original", notes: "Aparte", quantity: 10 });
    const equivalent = line({ id: "equivalent", quantity: 995 });
    const draft = { ...EMPTY_DRAFT, lines: [original, equivalent] };
    const replacement = line({ id: "original", quantity: 10 });
    assert.equal(replaceDraftLine(draft, "original", replacement), draft);
  });

  test("validates quantityPerItem bounds", () => {
    const draft = { ...EMPTY_DRAFT, lines: [line({ additions: [addition({ quantityPerItem: 101 })] })] };
    assert.match(validateDraft(draft, "OPEN").join(" "), /adicional inválida/i);
  });

  test("trims optional notes and omits empty notes", () => {
    const draft: DraftOrder = {
      notes: "   ",
      lines: [line({ notes: "  Sin cebolla  " })],
    };
    assert.deepEqual(createOrderPayload(draft), {
      items: [{ productId: "product-1", quantity: 1, notes: "Sin cebolla", additions: [] }],
    });
  });

  test("rejects notes over 500 characters", () => {
    assert.match(validateDraft({ ...EMPTY_DRAFT, notes: "x".repeat(501), lines: [line()] }, "OPEN").join(" "), /500/);
  });

  test("calculates line and draft totals", () => {
    const first = line({ quantity: 2, additions: [addition()] });
    const second = line({ id: "line-2", unitPrice: 4 });
    assert.equal(lineTotal(first), 28);
    assert.equal(draftTotal({ notes: "", lines: [first, second] }), 32);
  });

  test("payload contains no names, prices or imagePath", () => {
    const payload = createOrderPayload({ notes: "Mesa", lines: [line({ additions: [addition()] })] });
    const json = JSON.stringify(payload);
    assert.equal(/productName|additionName|unitPrice|imagePath|total/.test(json), false);
  });

  test("empty draft cannot be sent", () => {
    assert.match(validateDraft(EMPTY_DRAFT, "OPEN").join(" "), /al menos un producto/i);
  });

  test("session outside OPEN blocks send", () => {
    assert.match(validateDraft({ ...EMPTY_DRAFT, lines: [line()] }, "AWAITING_PAYMENT").join(" "), /no está abierta/i);
  });

  test("search is local, accent-insensitive and respects category", () => {
    const products = [product(), product({ id: "drink", categoryId: "cat-3", name: "Inca Kola", description: "Bebida fría" })];
    assert.deepEqual(visibleProducts(products, categories, "bebidas", "fria").map(({ id }) => id), ["drink"]);
  });

  test("submit lock allows only one concurrent operation", async () => {
    const lock = { current: false };
    let release: (() => void) | undefined;
    let calls = 0;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const operation = async () => { calls += 1; await pending; return calls; };
    const first = runWithSubmitLock(lock, operation);
    const second = runWithSubmitLock(lock, operation);
    release?.();
    assert.equal(await second, undefined);
    assert.equal(await first, 1);
    assert.equal(calls, 1);
  });

  test("success clears draft and failure keeps it", () => {
    const draft = { ...EMPTY_DRAFT, lines: [line()] };
    assert.deepEqual(draftAfterCreate(draft, true), EMPTY_DRAFT);
    assert.equal(draftAfterCreate(draft, false), draft);
  });

  test("confirmed 201 result clears both drafts, prepares backend feedback and replaces with Mesas", async () => {
    const calls: string[] = [];
    let feedbackSequence: number | null = null;
    const result = await submitConfirmedOrder(
      async () => createdOrder(23),
      {
        clearStoredDraft: () => { calls.push("stored"); },
        clearMemoryDraft: () => { calls.push("memory"); },
        prepareFeedback: (sequenceNumber) => {
          calls.push("feedback");
          feedbackSequence = sequenceNumber;
        },
        replaceWithTables: () => { calls.push("replace:/mesas"); },
      },
    );
    assert.equal(result.sequenceNumber, 23);
    assert.equal(feedbackSequence, 23);
    assert.deepEqual(calls, ["stored", "memory", "feedback", "replace:/mesas"]);
  });

  for (const errorKind of ["400", "409", "429", "500", "network", "ambiguous write"]) {
    test(`${errorKind} does not clear or navigate`, async () => {
      const calls: string[] = [];
      await assert.rejects(() => submitConfirmedOrder(
        async () => { throw new Error(errorKind); },
        {
          clearStoredDraft: () => { calls.push("stored"); },
          clearMemoryDraft: () => { calls.push("memory"); },
          prepareFeedback: () => { calls.push("feedback"); },
          replaceWithTables: () => { calls.push("replace"); },
        },
      ));
      assert.deepEqual(calls, []);
    });
  }

  test("invalid success body does not clear or navigate", async () => {
    const calls: string[] = [];
    await assert.rejects(() => submitConfirmedOrder(
      async () => ({ order: { sequenceNumber: 8 } }) as CreateOrderResult,
      {
        clearStoredDraft: () => { calls.push("stored"); },
        clearMemoryDraft: () => { calls.push("memory"); },
        prepareFeedback: () => { calls.push("feedback"); },
        replaceWithTables: () => { calls.push("replace"); },
      },
    ));
    assert.deepEqual(calls, []);
  });

  test("Mesas feedback uses the backend sequence and is consumed only once", () => {
    const storage = memoryStorage();
    assert.equal(storeOrderCreatedFeedback(31, storage), true);
    const sequenceNumber = consumeOrderCreatedFeedback(storage);
    assert.equal(sequenceNumber, 31);
    assert.equal(orderCreatedMessage(sequenceNumber ?? 0), "Comanda #31 enviada.");
    assert.equal(consumeOrderCreatedFeedback(storage), null);
  });

  test("refresh cannot repeat old Mesas feedback", () => {
    const storage = memoryStorage();
    storeOrderCreatedFeedback(5, storage);
    assert.equal(consumeOrderCreatedFeedback(storage), 5);
    assert.equal(consumeOrderCreatedFeedback(storage), null);
  });

  test("persists minimal draft data per session and clears it", () => {
    const values = new Map<string, string>();
    const storage: DraftStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const draft = {
      notes: "Primero bebidas",
      lines: [line({ additions: [addition()] })],
    };
    storeDraft("session-a", draft, storage);
    const restored = readStoredDraft("session-a", storage);
    assert.deepEqual(restored?.lines[0], {
      id: "line-1",
      productId: "product-1",
      quantity: 1,
      additions: [{ productId: "addition-1", quantityPerItem: 1 }],
    });
    assert.equal(JSON.stringify(restored).includes("Hamburguesa"), false);
    clearStoredDraft("session-a", storage);
    assert.equal(readStoredDraft("session-a", storage), null);
  });
});
