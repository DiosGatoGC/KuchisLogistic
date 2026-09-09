import { ApiError } from "@/lib/api/client";

import type { CloseFailureKind, ReconciliationFailureKind } from "./closeout-attempts";
import { closeFailureKind, closeoutErrorMessage, reconciliationFailureKind } from "./closeout-error-model";

export function closeoutApiErrorMessage(error: unknown, fallback?: string) {
  return error instanceof ApiError ? closeoutErrorMessage(error, fallback) : fallback ?? "No se pudo completar la operación.";
}

export function classifyCloseFailure(error: unknown): CloseFailureKind {
  return error instanceof ApiError ? closeFailureKind(error) : "other";
}

export function classifyReconciliationFailure(error: unknown): ReconciliationFailureKind {
  return error instanceof ApiError ? reconciliationFailureKind(error) : "other";
}

export function isReconciliationNotFound(error: unknown) {
  return error instanceof ApiError && error.code === "CASH_RECONCILIATION_NOT_FOUND";
}
