import type { Category } from "@/types/catalog";

export const ADDITIONS_CATEGORY_SLUG = "adicionales";

export const CUSTOMIZABLE_CATEGORY_SLUGS = new Set([
  "salchipapas",
  "hamburguesas",
  "broaster",
  "alitas",
  "de-pollo",
  "criollasos",
]);

export function getPublicCategories(categories: Category[]): Category[] {
  return categories
    .filter((category) => category.slug !== ADDITIONS_CATEGORY_SLUG)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
