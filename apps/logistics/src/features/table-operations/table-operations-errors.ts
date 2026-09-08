import { ApiError } from "@/lib/api/client";

import { operationalTableErrorMessage } from "./table-operations-error-model";
import type { CorrectiveFailureKind } from "./table-operations-mutation";

export function tableOperationsErrorMessage(
  error: unknown,
  fallback = "No se pudo completar la operación.",
) {
  if (!(error instanceof ApiError)) return fallback;
  return operationalTableErrorMessage(error, fallback);
}

export function correctiveFailureKind(error: unknown): CorrectiveFailureKind {
  if (!(error instanceof ApiError)) return "other";
  if (error.kind === "network" || error.kind === "server") return "ambiguous";
  if (error.kind === "not-found" || error.kind === "conflict") return "conflict";
  return "other";
}
