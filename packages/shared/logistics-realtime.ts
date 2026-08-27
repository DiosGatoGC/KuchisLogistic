export const LOGISTICS_REALTIME_VERSION = 1 as const;

export const LOGISTICS_REALTIME_TOPICS = {
  tables: "logistics:v1:tables",
  kitchen: "logistics:v1:kitchen",
  drinks: "logistics:v1:drinks",
  catalog: "logistics:v1:catalog",
  shift: "logistics:v1:shift",
  finance: "logistics:v1:finance",
} as const;

export type LogisticsRealtimeTopic =
  (typeof LOGISTICS_REALTIME_TOPICS)[keyof typeof LOGISTICS_REALTIME_TOPICS];

export type LogisticsPreparationStation = "KITCHEN" | "DRINKS";

export type LogisticsFinanceScope =
  | "PAYMENT"
  | "EXPENSE"
  | "CLOSURE"
  | "RECONCILIATION";

interface LogisticsRealtimeEventBase {
  version: typeof LOGISTICS_REALTIME_VERSION;
  occurredAt: string;
}

export interface TablesChangedEvent extends LogisticsRealtimeEventBase {
  type: "TABLES_CHANGED";
  serviceSessionIds: string[];
  servicePointIds: string[];
}

export interface OrdersChangedEvent extends LogisticsRealtimeEventBase {
  type: "ORDERS_CHANGED";
  orderId: string;
  serviceSessionIds: string[];
}

export interface PreparationChangedEvent extends LogisticsRealtimeEventBase {
  type: "PREPARATION_CHANGED";
  station: LogisticsPreparationStation;
  orderId: string;
  orderItemId?: string;
  serviceSessionIds: string[];
}

export interface CatalogChangedEvent extends LogisticsRealtimeEventBase {
  type: "CATALOG_CHANGED";
  productId: string;
}

export interface ShiftChangedEvent extends LogisticsRealtimeEventBase {
  type: "SHIFT_CHANGED";
  shiftId: string;
}

export interface FinanceChangedEvent extends LogisticsRealtimeEventBase {
  type: "FINANCE_CHANGED";
  scope: LogisticsFinanceScope;
  shiftId: string;
  serviceSessionId?: string;
}

export type LogisticsRealtimeEvent =
  | TablesChangedEvent
  | OrdersChangedEvent
  | PreparationChangedEvent
  | CatalogChangedEvent
  | ShiftChangedEvent
  | FinanceChangedEvent;
