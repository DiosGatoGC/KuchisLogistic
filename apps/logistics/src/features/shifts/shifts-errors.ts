import { ApiError } from "@/lib/api/client";

import type { ShiftMutationFailureKind } from "./shift-opening-attempt";
import { shiftErrorMessage, shiftMutationFailureKind } from "./shifts-error-model";

export function shiftsApiErrorMessage(error: unknown, fallback?: string) {
  return error instanceof ApiError ? shiftErrorMessage(error, fallback) : fallback ?? "No se pudo completar la operación de turno.";
}

export function classifyShiftMutationFailure(error: unknown): ShiftMutationFailureKind {
  return error instanceof ApiError ? shiftMutationFailureKind(error) : "other";
}
