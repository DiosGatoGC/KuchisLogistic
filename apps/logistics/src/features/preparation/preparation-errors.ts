import { ApiError } from "@/lib/api/client";

import {
  operationalPreparationErrorMessage,
  transitionConflictCodes,
} from "./preparation-error-model";
import type { TransitionFailureKind } from "./preparation-transition";

export function preparationErrorMessage(
  error: unknown,
  fallback = "No se pudo completar la operación.",
) {
  return error instanceof ApiError
    ? operationalPreparationErrorMessage(error, fallback)
    : fallback;
}

export function transitionFailureKind(error: unknown): TransitionFailureKind {
  if (!(error instanceof ApiError)) return "other";
  if (error.kind === "network" || error.kind === "server") return "ambiguous";
  if (
    error.kind === "not-found" ||
    error.kind === "conflict" ||
    transitionConflictCodes.has(error.code ?? "")
  ) {
    return "conflict";
  }
  return "other";
}
