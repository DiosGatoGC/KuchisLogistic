import { apiRequest } from "@/lib/api/client";

import {
  getCatalogCategories,
  getCatalogProducts,
} from "../ordering/ordering-api";
import type { CatalogProductsResult } from "../ordering/ordering-types";
import type { SetProductAvailabilityResult } from "./catalog-availability-types";

export { getCatalogCategories, getCatalogProducts };

export function setProductAvailability(
  productId: string,
  isAvailable: boolean,
  accessToken: string,
) {
  return apiRequest<SetProductAvailabilityResult>(
    `/api/logistics/catalog/products/${encodeURIComponent(productId)}/availability`,
    {
      method: "PATCH",
      accessToken,
      body: { isAvailable },
    },
  );
}

export async function refetchCatalogProducts(
  accessToken: string,
): Promise<CatalogProductsResult> {
  return getCatalogProducts(accessToken);
}
