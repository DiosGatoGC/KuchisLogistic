import { getSessionOrders } from "../ordering/ordering-api";
import { getServicePointStatus, getServiceSession } from "../tables/tables-api";
import { apiRequest } from "@/lib/api/client";

import type {
  CancelOrderItemResponse,
  TableOperationsSnapshot,
  TransferOrderItemInput,
  TransferOrderItemResponse,
  TransferSessionInput,
  TransferSessionResponse,
} from "./table-operations-types";

export async function getTableOperationsSnapshot(
  sessionId: string,
  accessToken: string,
): Promise<TableOperationsSnapshot> {
  const [pointsResult, sessionResult, orders] = await Promise.all([
    getServicePointStatus(accessToken),
    getServiceSession(sessionId, accessToken),
    getSessionOrders(sessionId, accessToken),
  ]);
  return {
    points: pointsResult.servicePoints,
    session: sessionResult.session,
    orders,
  };
}

export function cancelOrderItem(
  orderItemId: string,
  reason: string,
  accessToken: string,
) {
  return apiRequest<CancelOrderItemResponse>(
    `/api/logistics/order-items/${encodeURIComponent(orderItemId)}/cancel`,
    { method: "POST", accessToken, body: { reason } },
  );
}

export function transferServiceSession(
  sessionId: string,
  input: TransferSessionInput,
  accessToken: string,
) {
  return apiRequest<TransferSessionResponse>(
    `/api/logistics/sessions/${encodeURIComponent(sessionId)}/transfer`,
    { method: "POST", accessToken, body: input },
  );
}

export function transferOrderItem(
  orderItemId: string,
  input: TransferOrderItemInput,
  accessToken: string,
) {
  return apiRequest<TransferOrderItemResponse>(
    `/api/logistics/order-items/${encodeURIComponent(orderItemId)}/transfer`,
    { method: "POST", accessToken, body: input },
  );
}
