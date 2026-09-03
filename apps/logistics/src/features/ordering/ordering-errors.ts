import { ApiError } from "@/lib/api/client";

import {
  catalogChangeCodes,
  operationalOrderingErrorMessage,
  sessionChangeCodes,
} from "./ordering-error-model";

export function orderingErrorMessage(
  error: unknown,
  fallback = "No se pudo completar la operación.",
) {
  return error instanceof ApiError
    ? operationalOrderingErrorMessage(error, fallback)
    : fallback;
}

export function isCatalogChange(error: unknown) {
  return error instanceof ApiError && catalogChangeCodes.has(error.code ?? "");
}

export function isSessionChange(error: unknown) {
  return error instanceof ApiError && sessionChangeCodes.has(error.code ?? "");
}

export function isAmbiguousWrite(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.kind === "network" || error.kind === "server")
  );
}

