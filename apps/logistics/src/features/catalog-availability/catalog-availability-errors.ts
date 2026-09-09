import { ApiError } from "@/lib/api/client";

import type { AvailabilityFailureKind } from "./catalog-availability-mutation";
import {
  availabilityFailureKind,
  catalogAvailabilityErrorMessage,
} from "./catalog-availability-error-model";

export function catalogApiErrorMessage(
  error: unknown,
  fallback = "No se pudo actualizar la disponibilidad.",
) {
  if (!(error instanceof ApiError)) return fallback;
  return catalogAvailabilityErrorMessage(error, fallback);
}

export function classifyAvailabilityFailure(error: unknown): AvailabilityFailureKind {
  if (!(error instanceof ApiError)) return "other";
  return availabilityFailureKind(error);
}
