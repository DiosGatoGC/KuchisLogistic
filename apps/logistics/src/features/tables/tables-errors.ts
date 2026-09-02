import { ApiError } from "@/lib/api/client";

import { operationalErrorMessage } from "./tables-error-model";

export function isRefreshConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    [
      "SERVICE_POINT_OCCUPIED",
      "SESSION_STATE_CONFLICT",
      "SERVICE_SESSION_CHANGED",
      "SESSION_NOT_FOUND",
      "SERVICE_SESSION_NOT_FOUND",
    ].includes(error.code ?? "")
  );
}

export function tablesErrorMessage(
  error: unknown,
  fallback = "No se pudo actualizar el estado de mesas.",
) {
  if (!(error instanceof ApiError)) return fallback;
  return operationalErrorMessage(error, fallback);
}
