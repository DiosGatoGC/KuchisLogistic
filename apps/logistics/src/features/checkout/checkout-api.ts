import { apiRequest } from "@/lib/api/client";

import { getServicePointStatus, getServiceSession } from "../tables/tables-api";
import type {
  AwaitPaymentResult,
  CheckoutPreviewResult,
  CheckoutReconciliationState,
  ConfirmPaymentResult,
  PaymentMethod,
} from "./checkout-types";

export function getCheckoutPreview(sessionId: string, accessToken: string) {
  return apiRequest<CheckoutPreviewResult>(
    `/api/logistics/sessions/${encodeURIComponent(sessionId)}/checkout`,
    { accessToken },
  );
}

export function awaitCheckoutPayment(sessionId: string, accessToken: string) {
  return apiRequest<AwaitPaymentResult>(
    `/api/logistics/sessions/${encodeURIComponent(sessionId)}/await-payment`,
    { method: "POST", accessToken },
  );
}

export function getCheckoutSession(sessionId: string, accessToken: string) {
  return getServiceSession(sessionId, accessToken);
}

export function confirmCheckoutPayment(
  sessionId: string,
  method: PaymentMethod,
  expectedCheckoutToken: string,
  accessToken: string,
) {
  return apiRequest<ConfirmPaymentResult>(
    `/api/logistics/sessions/${encodeURIComponent(sessionId)}/payments`,
    {
      method: "POST",
      accessToken,
      expectedStatus: 201,
      body: { method, expectedCheckoutToken },
    },
  );
}

export async function getCheckoutReconciliation(
  sessionId: string,
  accessToken: string,
): Promise<CheckoutReconciliationState> {
  const [sessionResult, pointsResult] = await Promise.all([
    getServiceSession(sessionId, accessToken),
    getServicePointStatus(accessToken),
  ]);
  return {
    session: sessionResult.session,
    points: pointsResult.servicePoints,
  };
}
