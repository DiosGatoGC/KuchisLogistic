import type { Capability } from "../../types/auth.ts";
import type {
  OrderItem,
  SessionOrdersResult,
} from "../ordering/ordering-types.ts";
import type { ServicePointStatus } from "../tables/tables-types.ts";

export interface TableOperationPermissions {
  canView: boolean;
  canCancel: boolean;
  canTransfer: boolean;
}

export function tableOperationPermissions(
  capabilities: readonly Capability[],
): TableOperationPermissions {
  return {
    canView: capabilities.includes("tables.view"),
    canCancel: capabilities.includes("orders.cancel"),
    canTransfer: capabilities.includes("orders.transfer"),
  };
}

export function eligibleSessionTransferPoints(
  points: readonly ServicePointStatus[],
  sourcePointId: string,
) {
  return points.filter(
    (point) =>
      point.id !== sourcePointId && point.isActive && !point.activeSession,
  );
}

export function eligibleItemTransferSessions(
  points: readonly ServicePointStatus[],
  sourceSessionId: string,
) {
  return points.filter(
    (point) =>
      point.isActive &&
      point.activeSession !== null &&
      point.activeSession.id !== sourceSessionId,
  );
}

export function itemCanBeCorrected(item: OrderItem) {
  return item.status !== "CANCELLED";
}

export function findOrderItem(
  result: SessionOrdersResult,
  orderItemId: string,
) {
  for (const order of result.orders) {
    const item = order.items.find((candidate) => candidate.id === orderItemId);
    if (item) return item;
  }
  return null;
}

export function validateRequiredReason(value: string) {
  const reason = value.trim();
  if (!reason) {
    return { reason, error: "Escribe el motivo de la cancelación." } as const;
  }
  if (reason.length > 500) {
    return {
      reason,
      error: "El motivo no puede superar los 500 caracteres.",
    } as const;
  }
  return { reason, error: null } as const;
}

export function validateOptionalReason(value: string) {
  const reason = value.trim();
  if (reason.length > 500) {
    return {
      reason: undefined,
      error: "El motivo no puede superar los 500 caracteres.",
    } as const;
  }
  return { reason: reason || undefined, error: null } as const;
}

export function validateTransferQuantity(value: string, available: number) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return {
      quantity: null,
      error: "Escribe una cantidad entera mayor que cero.",
    } as const;
  }
  if (quantity > available) {
    return {
      quantity: null,
      error: `La cantidad no puede superar ${available}.`,
    } as const;
  }
  if (quantity > 1000) {
    return {
      quantity: null,
      error: "La cantidad no puede superar 1000.",
    } as const;
  }
  return { quantity, error: null } as const;
}

export type ReconciliationDecision = "applied" | "unchanged" | "changed";

export function reconcileCancellation(
  refreshed: SessionOrdersResult,
  orderItemId: string,
  previousStatus: OrderItem["status"],
): ReconciliationDecision {
  const item = findOrderItem(refreshed, orderItemId);
  if (!item) return "changed";
  if (item.status === "CANCELLED") return "applied";
  return item.status === previousStatus ? "unchanged" : "changed";
}

export function reconcileSessionTransfer(
  points: readonly ServicePointStatus[],
  sessionId: string,
  sourcePointId: string,
  destinationPointId: string,
): ReconciliationDecision {
  const destination = points.find((point) => point.id === destinationPointId);
  if (destination?.activeSession?.id === sessionId) return "applied";
  const source = points.find((point) => point.id === sourcePointId);
  if (source?.activeSession?.id === sessionId) return "unchanged";
  return "changed";
}

export function reconcileItemTransfer(
  refreshed: SessionOrdersResult,
  orderItemId: string,
  previousQuantity: number,
  transferredQuantity: number,
): ReconciliationDecision {
  const item = findOrderItem(refreshed, orderItemId);
  if (!item) return transferredQuantity === previousQuantity ? "applied" : "changed";
  const expectedQuantity = previousQuantity - transferredQuantity;
  if (expectedQuantity > 0 && item.quantity === expectedQuantity) return "applied";
  if (item.quantity === previousQuantity) return "unchanged";
  return "changed";
}

export async function runWithOperationLock<T>(
  locks: Set<string>,
  key: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try {
    return await operation();
  } finally {
    locks.delete(key);
  }
}
