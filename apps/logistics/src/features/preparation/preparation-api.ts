import { apiRequest } from "@/lib/api/client";

import type {
  PreparationQueueResponse,
  PreparationStation,
  TransitionResponse,
} from "./preparation-types";

export function getKitchenQueue(accessToken: string) {
  return apiRequest<PreparationQueueResponse>(
    "/api/logistics/preparation/kitchen",
    { accessToken },
  );
}

export function getDrinksQueue(accessToken: string) {
  return apiRequest<PreparationQueueResponse>(
    "/api/logistics/preparation/drinks",
    { accessToken },
  );
}

export function getPreparationQueue(
  station: PreparationStation,
  accessToken: string,
) {
  return station === "KITCHEN"
    ? getKitchenQueue(accessToken)
    : getDrinksQueue(accessToken);
}

function transitionOrderItem(
  orderItemId: string,
  action: "start" | "ready" | "deliver",
  accessToken: string,
) {
  return apiRequest<TransitionResponse>(
    `/api/logistics/order-items/${encodeURIComponent(orderItemId)}/${action}`,
    { method: "POST", accessToken, expectedStatus: 200 },
  );
}

export function startOrderItem(orderItemId: string, accessToken: string) {
  return transitionOrderItem(orderItemId, "start", accessToken);
}

export function readyOrderItem(orderItemId: string, accessToken: string) {
  return transitionOrderItem(orderItemId, "ready", accessToken);
}

export function deliverOrderItem(orderItemId: string, accessToken: string) {
  return transitionOrderItem(orderItemId, "deliver", accessToken);
}
