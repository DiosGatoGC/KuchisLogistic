import {
  LOGISTICS_REALTIME_TOPICS,
  LOGISTICS_REALTIME_VERSION,
  type LogisticsRealtimeEvent,
  type LogisticsRealtimeTopic,
} from "@kuchis/shared/logistics-realtime";

const FINANCE_SCOPES = new Set([
  "PAYMENT",
  "EXPENSE",
  "CLOSURE",
  "RECONCILIATION",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasValidBase(value: Record<string, unknown>) {
  return (
    value.version === LOGISTICS_REALTIME_VERSION &&
    isNonEmptyString(value.occurredAt) &&
    !Number.isNaN(Date.parse(value.occurredAt))
  );
}

function isEventShape(value: Record<string, unknown>): boolean {
  if (!hasValidBase(value)) return false;

  switch (value.type) {
    case "TABLES_CHANGED":
      return isStringArray(value.serviceSessionIds) && isStringArray(value.servicePointIds);
    case "ORDERS_CHANGED":
      return isNonEmptyString(value.orderId) && isStringArray(value.serviceSessionIds);
    case "PREPARATION_CHANGED":
      return (
        (value.station === "KITCHEN" || value.station === "DRINKS") &&
        isNonEmptyString(value.orderId) &&
        (value.orderItemId === undefined || isNonEmptyString(value.orderItemId)) &&
        isStringArray(value.serviceSessionIds)
      );
    case "CATALOG_CHANGED":
      return isNonEmptyString(value.productId);
    case "SHIFT_CHANGED":
      return isNonEmptyString(value.shiftId);
    case "FINANCE_CHANGED":
      return (
        FINANCE_SCOPES.has(String(value.scope)) &&
        isNonEmptyString(value.shiftId) &&
        (value.serviceSessionId === undefined || isNonEmptyString(value.serviceSessionId))
      );
    default:
      return false;
  }
}

export function isLogisticsRealtimeTopic(value: string): value is LogisticsRealtimeTopic {
  return Object.values(LOGISTICS_REALTIME_TOPICS).includes(value as LogisticsRealtimeTopic);
}

export function eventInvalidatesTopic(
  topic: LogisticsRealtimeTopic,
  value: unknown,
): value is LogisticsRealtimeEvent {
  if (!isRecord(value) || !isEventShape(value)) return false;
  const event = value as unknown as LogisticsRealtimeEvent;

  switch (topic) {
    case LOGISTICS_REALTIME_TOPICS.tables:
      return event.type === "TABLES_CHANGED" || event.type === "ORDERS_CHANGED";
    case LOGISTICS_REALTIME_TOPICS.kitchen:
      return event.type === "PREPARATION_CHANGED" && event.station === "KITCHEN";
    case LOGISTICS_REALTIME_TOPICS.drinks:
      return event.type === "PREPARATION_CHANGED" && event.station === "DRINKS";
    case LOGISTICS_REALTIME_TOPICS.catalog:
      return event.type === "CATALOG_CHANGED";
    case LOGISTICS_REALTIME_TOPICS.shift:
      return event.type === "SHIFT_CHANGED";
    case LOGISTICS_REALTIME_TOPICS.finance:
      return event.type === "FINANCE_CHANGED";
  }
}

export function eventsForTopic(topic: LogisticsRealtimeTopic): readonly LogisticsRealtimeEvent["type"][] {
  switch (topic) {
    case LOGISTICS_REALTIME_TOPICS.tables:
      return ["TABLES_CHANGED", "ORDERS_CHANGED"];
    case LOGISTICS_REALTIME_TOPICS.kitchen:
    case LOGISTICS_REALTIME_TOPICS.drinks:
      return ["PREPARATION_CHANGED"];
    case LOGISTICS_REALTIME_TOPICS.catalog:
      return ["CATALOG_CHANGED"];
    case LOGISTICS_REALTIME_TOPICS.shift:
      return ["SHIFT_CHANGED"];
    case LOGISTICS_REALTIME_TOPICS.finance:
      return ["FINANCE_CHANGED"];
  }
}

export type RealtimeConnectionState = "connecting" | "synchronized" | "delayed";

export function connectionStatusAction(status: string): {
  state: RealtimeConnectionState;
  refresh: boolean;
} {
  if (status === "SUBSCRIBED") return { state: "synchronized", refresh: true };
  if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
    return { state: "delayed", refresh: false };
  }
  return { state: "connecting", refresh: false };
}
