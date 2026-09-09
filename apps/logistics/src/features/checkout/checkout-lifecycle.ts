import { executePaymentAttempt } from "./checkout-attempt.ts";
import type { PaymentFailureKind, PaymentAttemptResult } from "./checkout-attempt.ts";
import {
  checkoutEconomicsMatch,
  normalizeCheckout,
} from "./checkout-model.ts";
import type { CheckoutModel } from "./checkout-model.ts";
import type {
  AwaitPaymentResult,
  CheckoutPreviewResult,
  CheckoutReconciliationState,
  ConfirmPaymentResult,
} from "./checkout-types.ts";
import type { ServiceSessionDetail } from "../tables/tables-types.ts";

type AwaitFailureKind = "ambiguous" | "deterministic";

export type CheckoutLifecycleResult =
  | { kind: "payment"; result: PaymentAttemptResult }
  | { kind: "checkout-changed-before-payment"; preview: CheckoutPreviewResult }
  | { kind: "await-payment-not-applied"; session: ServiceSessionDetail }
  | { kind: "await-payment-failed"; error: unknown }
  | { kind: "session-not-payable"; session: ServiceSessionDetail }
  | { kind: "session-not-ready"; preview: CheckoutPreviewResult }
  | {
      kind: "await-payment-unresolved";
      error: unknown;
      reconciliationError: unknown;
    };

export async function executeCheckoutLifecycle({
  reviewedCheckout,
  readSession,
  awaitPayment,
  refreshPreview,
  pay,
  reconcilePayment,
  classifyAwaitFailure,
  classifyPaymentFailure,
}: {
  reviewedCheckout: CheckoutModel;
  readSession: () => Promise<ServiceSessionDetail>;
  awaitPayment: () => Promise<AwaitPaymentResult>;
  refreshPreview: () => Promise<CheckoutPreviewResult>;
  pay: (currentCheckoutToken: string) => Promise<ConfirmPaymentResult>;
  reconcilePayment: () => Promise<CheckoutReconciliationState>;
  classifyAwaitFailure: (error: unknown) => AwaitFailureKind;
  classifyPaymentFailure: (error: unknown) => PaymentFailureKind;
}): Promise<CheckoutLifecycleResult> {
  let session = await readSession();

  if (session.status === "OPEN") {
    try {
      const transition = await awaitPayment();
      session = transition.session;
    } catch (error) {
      if (classifyAwaitFailure(error) === "deterministic") {
        return { kind: "await-payment-failed", error };
      }
      try {
        session = await readSession();
      } catch (reconciliationError) {
        return {
          kind: "await-payment-unresolved",
          error,
          reconciliationError,
        };
      }
      if (session.status === "OPEN") {
        return { kind: "await-payment-not-applied", session };
      }
    }
  }

  if (session.status !== "AWAITING_PAYMENT") {
    return { kind: "session-not-payable", session };
  }

  const preview = await refreshPreview();
  if (preview.checkout.session.status !== "AWAITING_PAYMENT") {
    return { kind: "session-not-ready", preview };
  }
  if (!checkoutEconomicsMatch(reviewedCheckout, preview.checkout)) {
    return { kind: "checkout-changed-before-payment", preview };
  }

  const currentCheckout = normalizeCheckout(preview.checkout);
  return {
    kind: "payment",
    result: await executePaymentAttempt({
      pay: () => pay(currentCheckout.checkoutToken),
      reconcile: reconcilePayment,
      refreshPreview,
      classifyFailure: classifyPaymentFailure,
    }),
  };
}
