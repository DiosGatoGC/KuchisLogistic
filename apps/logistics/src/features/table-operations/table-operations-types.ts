import type { OrderItemStatus, SessionOrdersResult } from "../ordering/ordering-types";
import type { ServicePointStatus, ServiceSessionDetail } from "../tables/tables-types";

export interface TableOperationsSnapshot {
  points: ServicePointStatus[];
  session: ServiceSessionDetail;
  orders: SessionOrdersResult;
}

export interface CancelOrderItemResponse {
  orderItem: {
    orderItemId: string;
    status: "CANCELLED";
    cancelledFromStatus: OrderItemStatus;
    cancelledAt: string;
    cancellationReason: string;
  };
}

export interface TransferSessionInput {
  toServicePointId: string;
  reason?: string;
}

export interface TransferSessionResponse {
  transfer: {
    serviceSessionId: string;
    transferId: string;
    fromServicePoint: { id: string; name: string };
    toServicePoint: { id: string; name: string };
    transferredAt: string;
  };
}

export interface TransferOrderItemInput {
  toSessionId: string;
  quantity: number;
  reason?: string;
}

export interface TransferOrderItemResponse {
  transfer: {
    orderItemId: string;
    sourceOrderItemId: string;
    transferId: string;
    fromServiceSessionId: string;
    toServiceSessionId: string;
    quantity: number;
    remainingQuantity: number;
    split: boolean;
    status: OrderItemStatus;
  };
}
