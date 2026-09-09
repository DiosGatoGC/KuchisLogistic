import type { Capability } from "../../types/auth.ts";
import type {
  CatalogCategory,
  CatalogProduct,
} from "../ordering/ordering-types.ts";
import type {
  CatalogAvailabilityModel,
  CatalogProductView,
} from "./catalog-availability-types.ts";

export function normalizeCatalog(
  categories: readonly CatalogCategory[],
  products: readonly CatalogProduct[],
): CatalogAvailabilityModel {
  const sortedCategories = categories.toSorted(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
  const categoriesById = new Map(sortedCategories.map((category) => [category.id, category]));
  return {
    categories: sortedCategories,
    products: products.map((product) => {
      const category = categoriesById.get(product.categoryId);
      return {
        ...product,
        categoryName: category?.name ?? "Sin categoría",
        categorySlug: category?.slug ?? "uncategorized",
      };
    }),
  };
}

export function filterCatalogProducts(
  products: readonly CatalogProductView[],
  categorySlug: string,
) {
  return categorySlug === "all"
    ? [...products]
    : products.filter((product) => product.categorySlug === categorySlug);
}

export function catalogAvailabilityPermissions(capabilities: readonly Capability[]) {
  return {
    canView: capabilities.includes("tables.view"),
    canMutate: capabilities.includes("catalog.availability"),
  };
}

export function availabilityPayload(isAvailable: boolean) {
  return { isAvailable } as const;
}

export type AvailabilityReconciliationDecision = "applied" | "unchanged" | "missing";

export function reconcileProductAvailability(
  products: readonly CatalogProduct[],
  productId: string,
  previousAvailability: boolean,
  requestedAvailability: boolean,
): AvailabilityReconciliationDecision {
  const product = products.find((candidate) => candidate.id === productId);
  if (!product) return "missing";
  if (product.isAvailable === requestedAvailability) return "applied";
  if (product.isAvailable === previousAvailability) return "unchanged";
  return "unchanged";
}

export async function runWithProductLock<T>(
  locks: Set<string>,
  productId: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (locks.has(productId)) return undefined;
  locks.add(productId);
  try {
    return await operation();
  } finally {
    locks.delete(productId);
  }
}
