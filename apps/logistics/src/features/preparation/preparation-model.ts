import type { Capability } from "../../types/auth.ts";
import type {
  PreparationAction,
  PreparationQueueItem,
  PreparationStation,
  PreparationStatus,
  TransitionStatus,
} from "./preparation-types.ts";

export const PREPARATION_STATUSES = ["PENDING", "PREPARING", "READY"] as const;
export type PreparationAgeLevel = "NORMAL" | "WARNING" | "URGENT" | "CRITICAL";

export const preparationStatusLabels: Record<PreparationStatus, string> = {
  PENDING: "Pendiente",
  PREPARING: "Preparando",
  READY: "Listo",
};

export const preparationGroupLabels: Record<PreparationStatus, string> = {
  PENDING: "Pendientes",
  PREPARING: "Preparando",
  READY: "Listos",
};

export const preparationStationLabels: Record<PreparationStation, string> = {
  KITCHEN: "Cocina",
  DRINKS: "Bebidas",
};

const actionByStatus: Record<PreparationStatus, PreparationAction> = {
  PENDING: "start",
  PREPARING: "ready",
  READY: "deliver",
};

export const preparationActionLabels: Record<PreparationAction, string> = {
  start: "Iniciar",
  ready: "Marcar listo",
  deliver: "Entregar",
};

const destinationByAction: Record<PreparationAction, TransitionStatus> = {
  start: "PREPARING",
  ready: "READY",
  deliver: "DELIVERED",
};

export function groupPreparationItems(items: readonly PreparationQueueItem[]) {
  return {
    PENDING: items.filter(({ orderItem }) => orderItem.status === "PENDING"),
    PREPARING: items.filter(({ orderItem }) => orderItem.status === "PREPARING"),
    READY: items.filter(({ orderItem }) => orderItem.status === "READY"),
  } satisfies Record<PreparationStatus, PreparationQueueItem[]>;
}

export function itemsForStation(
  items: readonly PreparationQueueItem[],
  station: PreparationStation,
) {
  return items.filter(
    ({ orderItem }) => orderItem.preparationStation === station,
  );
}

export function nextPreparationAction(status: PreparationStatus) {
  return actionByStatus[status];
}

export function destinationStatus(action: PreparationAction) {
  return destinationByAction[action];
}

export function stationPermissions(
  capabilities: readonly Capability[],
  station: PreparationStation,
) {
  const prefix = station === "KITCHEN" ? "orders.kitchen" : "orders.drinks";
  const canManage = capabilities.includes(`${prefix}.manage` as Capability);
  return {
    canView: canManage || capabilities.includes(`${prefix}.view` as Capability),
    canManage,
  };
}

export function preparationStationsForCapabilities(
  capabilities: readonly Capability[],
) {
  return (["KITCHEN", "DRINKS"] as const).filter(
    (station) => stationPermissions(capabilities, station).canView,
  );
}

export function queueItemIdentity(item: PreparationQueueItem) {
  return `${item.servicePoint.name} · Comanda #${item.order.sequenceNumber}`;
}

export function formatElapsed(sentAt: string, nowMs: number) {
  const sentAtMs = new Date(sentAt).getTime();
  if (!Number.isFinite(sentAtMs)) return "Hora no disponible";
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - sentAtMs) / 60_000));
  if (elapsedMinutes < 1) return "Ahora";
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function getPreparationAgeLevel(
  sentAt: string,
  nowMs: number,
): PreparationAgeLevel {
  const sentAtMs = new Date(sentAt).getTime();
  if (!Number.isFinite(sentAtMs)) return "NORMAL";
  const ageMinutes = Math.max(0, (nowMs - sentAtMs) / 60_000);
  if (ageMinutes < 10) return "NORMAL";
  if (ageMinutes < 15) return "WARNING";
  if (ageMinutes < 20) return "URGENT";
  return "CRITICAL";
}

export type TransitionReconciliation = "applied" | "unchanged" | "changed";

export function reconcileTransition(
  orderItemId: string,
  action: PreparationAction,
  refreshedItems: readonly PreparationQueueItem[],
): TransitionReconciliation {
  const item = refreshedItems.find(({ orderItem }) => orderItem.id === orderItemId);
  const destination = destinationStatus(action);
  if (!item) return destination === "DELIVERED" ? "applied" : "changed";
  if (item.orderItem.status === destination) return "applied";
  const expectedOrigin = action === "start"
    ? "PENDING"
    : action === "ready"
      ? "PREPARING"
      : "READY";
  return item.orderItem.status === expectedOrigin ? "unchanged" : "changed";
}

export async function runWithItemLock<T>(
  locks: Set<string>,
  orderItemId: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (locks.has(orderItemId)) return undefined;
  locks.add(orderItemId);
  try {
    return await operation();
  } finally {
    locks.delete(orderItemId);
  }
}
