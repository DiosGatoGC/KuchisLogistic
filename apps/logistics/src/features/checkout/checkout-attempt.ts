import { checkoutReconciliationDecision } from "./checkout-model.ts";
import type {
  CheckoutPreviewResult,
  CheckoutReconciliationState,
  ConfirmPaymentResult,
} from "./checkout-types.ts";

export type PaymentFailureKind = "checkout-changed" | "ambiguous" | "other";

export type PaymentAttemptResult =
  | {
      kind: "confirmed";
      response: ConfirmPaymentResult;
      reconciliation: CheckoutReconciliationState;
    }
  | {
      kind: "confirmed-reconciliation-failed";
      response: ConfirmPaymentResult;
      reconciliationError: unknown;
    }
  | { kind: "checkout-changed"; error: unknown; preview: CheckoutPreviewResult }
  | {
      kind: "ambiguous-active";
      error: unknown;
      reconciliation: CheckoutReconciliationState;
      preview: CheckoutPreviewResult;
    }
  | {
      kind: "ambiguous-paid" | "ambiguous-closed";
      error: unknown;
      reconciliation: CheckoutReconciliationState;
    }
  | {
      kind: "unresolved";
      failureKind: "checkout-changed" | "ambiguous";
      error: unknown;
      reconciliationError: unknown;
    };

export async function executePaymentAttempt({
  pay,
  reconcile,
  refreshPreview,
  classifyFailure,
}: {
  pay: () => Promise<ConfirmPaymentResult>;
  reconcile: () => Promise<CheckoutReconciliationState>;
  refreshPreview: () => Promise<CheckoutPreviewResult>;
  classifyFailure: (error: unknown) => PaymentFailureKind;
}): Promise<PaymentAttemptResult> {
  let response: ConfirmPaymentResult;
  try {
    response = await pay();
  } catch (error) {
    const failureKind = classifyFailure(error);
    if (failureKind === "other") throw error;
    if (failureKind === "checkout-changed") {
      try {
        return { kind: "checkout-changed", error, preview: await refreshPreview() };
      } catch (reconciliationError) {
        return { kind: "unresolved", failureKind, error, reconciliationError };
      }
    }
    try {
      const reconciliation = await reconcile();
      const decision = checkoutReconciliationDecision(reconciliation);
      if (decision === "paid") {
        return { kind: "ambiguous-paid", error, reconciliation };
      }
      if (decision === "closed") {
        return { kind: "ambiguous-closed", error, reconciliation };
      }
      try {
        return {
          kind: "ambiguous-active",
          error,
          reconciliation,
          preview: await refreshPreview(),
        };
      } catch (reconciliationError) {
        return { kind: "unresolved", failureKind, error, reconciliationError };
      }
    } catch (reconciliationError) {
      return { kind: "unresolved", failureKind, error, reconciliationError };
    }
  }

  try {
    return { kind: "confirmed", response, reconciliation: await reconcile() };
  } catch (reconciliationError) {
    return { kind: "confirmed-reconciliation-failed", response, reconciliationError };
  }
}
