export type PreparationStation = "KITCHEN" | "DRINKS";
export type PreparationStatus = "PENDING" | "PREPARING" | "READY";
export type TransitionStatus = PreparationStatus | "DELIVERED";
export type PreparationAction = "start" | "ready" | "deliver";

export interface PreparationQueueItem {
  orderItem: {
    id: string;
    productName: string;
    quantity: number;
    notes: string | null;
    status: PreparationStatus;
    preparationStation: PreparationStation;
    preparingAt: string | null;
    readyAt: string | null;
    deliveredAt: string | null;
  };
  additions: Array<{
    productId: string;
    additionName: string;
    quantityPerItem: number;
  }>;
  order: {
    id: string;
    sequenceNumber: number;
    sentAt: string;
  };
  session: { id: string };
  servicePoint: { id: string; name: string };
}

export interface PreparationQueueResponse {
  items: PreparationQueueItem[];
}

export interface TransitionResponse {
  orderItem: {
    orderItemId: string;
    status: TransitionStatus;
    preparationStation: PreparationStation;
    preparingAt: string | null;
    readyAt: string | null;
    deliveredAt: string | null;
  };
}
