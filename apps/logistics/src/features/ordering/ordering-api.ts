import { apiRequest } from "@/lib/api/client";

import type {
  CatalogCategoriesResult,
  CatalogProductsResult,
  CreateOrderInput,
  CreateOrderResult,
  SessionOrdersResult,
} from "./ordering-types";

export function getCatalogCategories(accessToken: string) {
  return apiRequest<CatalogCategoriesResult>(
    "/api/logistics/catalog/categories",
    { accessToken },
  );
}

export function getCatalogProducts(
  accessToken: string,
  categorySlug?: string,
) {
  const query = categorySlug
    ? `?category=${encodeURIComponent(categorySlug)}`
    : "";
  return apiRequest<CatalogProductsResult>(
    `/api/logistics/catalog/products${query}`,
    { accessToken },
  );
}

export function getSessionOrders(sessionId: string, accessToken: string) {
  return apiRequest<SessionOrdersResult>(
    `/api/logistics/sessions/${sessionId}/orders`,
    { accessToken },
  );
}

export function createSessionOrder(
  sessionId: string,
  input: CreateOrderInput,
  accessToken: string,
) {
  return apiRequest<CreateOrderResult>(
    `/api/logistics/sessions/${sessionId}/orders`,
    { method: "POST", accessToken, body: input, expectedStatus: 201 },
  );
}
