import type { ApiErrorKind } from "../../lib/api/client.ts";
import type { CloseFailureKind, ReconciliationFailureKind } from "./closeout-attempts.ts";

const messagesByCode: Record<string, string> = {
  SHIFT_HAS_ACTIVE_SESSIONS: "El turno todavía tiene atenciones activas.",
  SHIFT_HAS_UNRESOLVED_ITEMS: "El turno todavía tiene ítems sin resolver.",
  SHIFT_PAYMENT_INCONSISTENT: "Los pagos del turno no son consistentes.",
  SHIFT_CANCELLED_SESSION_HAS_CONSUMPTION: "Una atención cancelada conserva consumo activo.",
  SHIFT_EXPECTED_CASH_NEGATIVE: "El efectivo esperado del turno no puede ser negativo.",
  SHIFT_CHANGED: "El turno cambió durante el cierre. Revisa su estado antes de continuar.",
  SHIFT_ALREADY_CLOSED: "El turno ya está cerrado.",
  SHIFT_CLOSURE_ALREADY_EXISTS: "El turno ya tiene un cierre registrado.",
  SHIFT_CLOSURE_NOT_FOUND: "El cierre autoritativo del turno no existe.",
  SHIFT_NOT_CLOSED: "El turno todavía no está cerrado.",
  CASH_RECONCILIATION_ALREADY_EXISTS: "El turno ya tiene un cuadre registrado.",
  CASH_RECONCILIATION_NOT_FOUND: "El turno todavía no tiene un cuadre.",
};

export function closeoutErrorMessage(
  error: { kind: ApiErrorKind; code?: string },
  fallback = "No se pudo completar la operación.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "No tienes permiso para realizar esta operación.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  return fallback;
}

const closeReconciliationCodes = new Set(["SHIFT_CHANGED", "SHIFT_ALREADY_CLOSED", "SHIFT_CLOSURE_ALREADY_EXISTS"]);

export function closeFailureKind(error: { kind: ApiErrorKind; code?: string }): CloseFailureKind {
  if (error.code && closeReconciliationCodes.has(error.code)) return "reconcile";
  return error.kind === "network" || error.kind === "server" ? "ambiguous" : "other";
}

export function reconciliationFailureKind(
  error: { kind: ApiErrorKind; code?: string },
): ReconciliationFailureKind {
  if (error.code === "CASH_RECONCILIATION_ALREADY_EXISTS") return "already-exists";
  return error.kind === "network" || error.kind === "server" ? "ambiguous" : "other";
}
