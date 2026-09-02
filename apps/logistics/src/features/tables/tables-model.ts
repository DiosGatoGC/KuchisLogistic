import type { OperationalStatus } from "@/components/ui/status-badge";

import type { ServicePointStatus } from "./tables-types";

export type PointInteraction = "open" | "view" | "none";

const diningOrder = [
  "Mesa 6",
  "Mesa 5",
  "Mesa 4",
  "Mesa 3",
  "Mesa 2",
  "Mesa 1",
  "Mesa 7",
  "B4",
  "B3",
  "B2",
  "B1",
] as const;

const diningRank = new Map<string, number>(
  diningOrder.map((name, index) => [name.toLocaleUpperCase("es-PE"), index]),
);

export function statusForPoint(point: ServicePointStatus): OperationalStatus {
  if (!point.isActive) return "inactive";
  if (point.activeSession?.status === "OPEN") return "open";
  if (point.activeSession?.status === "AWAITING_PAYMENT") return "payment";
  return "available";
}

export function interactionForPoint(
  point: ServicePointStatus,
  canOperate: boolean,
): PointInteraction {
  if (!point.isActive) return "none";
  if (point.activeSession) return "view";
  return canOperate ? "open" : "none";
}

export function displayLabel(point: ServicePointStatus) {
  if (point.type !== "TABLE") return point.name;
  return point.name.replace(/^Mesa\s+/i, "");
}

export function arrangeDiningPoints(points: readonly ServicePointStatus[]) {
  return points
    .filter((point) => point.type === "TABLE" || point.type === "BAR")
    .toSorted((left, right) => {
      const leftRank = diningRank.get(left.name.toLocaleUpperCase("es-PE"));
      const rightRank = diningRank.get(right.name.toLocaleUpperCase("es-PE"));
      if (leftRank !== undefined && rightRank !== undefined) {
        return leftRank - rightRank;
      }
      if (leftRank !== undefined) return -1;
      if (rightRank !== undefined) return 1;
      return left.sortOrder - right.sortOrder;
    });
}

export function arrangeTakeawayPoints(points: readonly ServicePointStatus[]) {
  return points
    .filter((point) => point.type === "TAKEAWAY")
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

export function validateReleaseReason(value: string) {
  const reason = value.trim();
  if (!reason) {
    return { reason, error: "Escribe el motivo de la liberación." } as const;
  }
  if (reason.length > 500) {
    return {
      reason,
      error: "El motivo no puede superar los 500 caracteres.",
    } as const;
  }
  return { reason, error: null } as const;
}
