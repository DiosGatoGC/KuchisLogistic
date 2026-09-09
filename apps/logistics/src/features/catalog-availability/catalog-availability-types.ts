import type {
  CatalogCategory,
  CatalogProduct,
} from "../ordering/ordering-types";

export interface CatalogProductView extends CatalogProduct {
  categoryName: string;
  categorySlug: string;
}

export interface CatalogAvailabilityModel {
  categories: CatalogCategory[];
  products: CatalogProductView[];
}

export interface SetProductAvailabilityResult {
  product: {
    productId: string;
    isAvailable: boolean;
  };
}
