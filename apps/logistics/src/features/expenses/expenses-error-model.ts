import type { ApiErrorKind } from "../../lib/api/client.ts";
import type { ExpenseMutationFailureKind } from "./expense-mutations.ts";

const messagesByCode: Record<string, string> = {
  SHIFT_EXPENSE_NOT_FOUND: "El gasto ya no existe.",
  SHIFT_EXPENSE_ALREADY_VOIDED: "El gasto ya fue anulado.",
  SHIFT_EXPENSE_CHANGED: "El gasto cambió mientras se procesaba la operación.",
  EXPENSE_SHIFT_CLOSED: "El turno del gasto ya fue cerrado.",
  SHIFT_NOT_OPEN: "No existe un turno abierto para registrar gastos.",
  EXPENSE_CUSTOM_CATEGORY_REQUIRED: "La categoría personalizada es obligatoria para Otro.",
  EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED: "La categoría personalizada sólo se admite para Otro.",
  EXPENSE_VOID_REASON_REQUIRED: "El motivo de anulación es obligatorio.",
};

export function expenseErrorMessage(
  error: { kind: ApiErrorKind; code?: string },
  fallback = "No se pudo completar la operación de gastos.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "No tienes permiso para operar gastos.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  return fallback;
}

export function expenseMutationFailureKind(
  error: { kind: ApiErrorKind },
): ExpenseMutationFailureKind {
  return error.kind === "network" || error.kind === "server" ? "ambiguous" : "other";
}
