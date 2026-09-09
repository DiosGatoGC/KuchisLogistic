import { ApiError } from "@/lib/api/client";

import type { PaymentFailureKind } from "./checkout-attempt";
import {
  checkoutErrorMessage,
  paymentFailureKind,
  sessionTransitionFailureKind,
} from "./checkout-error-model";

export function checkoutApiErrorMessage(
  error: unknown,
  fallback = "No se pudo completar el cobro.",
) {
  if (!(error instanceof ApiError)) return fallback;
  return checkoutErrorMessage(error, fallback);
}

export function classifyPaymentFailure(error: unknown): PaymentFailureKind {
  if (!(error instanceof ApiError)) return "other";
  return paymentFailureKind(error);
}

export function classifySessionTransitionFailure(error: unknown) {
  if (!(error instanceof ApiError)) return "deterministic" as const;
  return sessionTransitionFailureKind(error);
}
