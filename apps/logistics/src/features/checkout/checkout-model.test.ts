import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executePaymentAttempt } from "./checkout-attempt.ts";
import {
  checkoutErrorMessage,
  paymentFailureKind,
  sessionTransitionFailureKind,
} from "./checkout-error-model.ts";
import { executeCheckoutLifecycle } from "./checkout-lifecycle.ts";
import {
  checkoutEconomicsMatch,
  checkoutPermissions,
  checkoutReconciliationDecision,
  normalizeCheckout,
  paymentOperationallyClosed,
  paymentPayload,
  paymentSubmissionAllowed,
  runWithPaymentLock,
} from "./checkout-model.ts";
import type {
  CheckoutPreview,
  CheckoutReconciliationState,
  ConfirmPaymentResult,
} from "./checkout-types.ts";

const preview: CheckoutPreview = {
  session: {
    id: "session-1",
    status: "AWAITING_PAYMENT",
    servicePoint: { id: "point-1", name: "Mesa 1", type: "TABLE" },
  },
  items: [{
    id: "item-1",
    productId: "product-1",
    productName: "Ramen",
    unitPrice: 18.25,
    quantity: 2,
    status: "DELIVERED",
    additions: [{
      productId: "addition-1",
      additionName: "Huevo",
      unitPrice: 2.5,
      quantityPerItem: 1,
    }],
    lineTotal: 41.5,
  }],
  businessAmount: 41.5,
  paymentOptions: {
    CASH: { method: "CASH", businessAmount: 41.5, feeRate: 0, feeAmount: 0, customerTotal: 41.5 },
    YAPE: { method: "YAPE", businessAmount: 41.5, feeRate: 0.01, feeAmount: 0.42, customerTotal: 41.92 },
    CARD: { method: "CARD", businessAmount: 41.5, feeRate: 0.05, feeAmount: 2.08, customerTotal: 43.58 },
  },
  checkoutToken: "checkout-version-17",
};

function reconciliation(status: CheckoutReconciliationState["session"]["status"]): CheckoutReconciliationState {
  return {
    session: {
      id: "session-1",
      status,
      openedAt: "2026-09-07T12:00:00.000Z",
      servicePoint: { id: "point-1", name: "Mesa 1", type: "TABLE" },
      shift: { id: "shift-1" },
      openedBy: { id: "user-1", fullName: "Caja", role: "CASHIER" },
    },
    points: [],
  };
}

const payment: ConfirmPaymentResult = {
  payment: {
    paymentId: "payment-1",
    serviceSessionId: "session-1",
    shiftId: "shift-1",
    method: "CARD",
    businessAmount: 41.5,
    feeRate: 0.05,
    feeAmount: 2.08,
    customerTotal: 43.58,
    paidAt: "2026-09-07T13:00:00.000Z",
    sessionStatus: "PAID",
  },
};

function previewResult(
  status: CheckoutPreview["session"]["status"],
  checkoutToken = preview.checkoutToken,
) {
  return {
    checkout: {
      ...preview,
      session: { ...preview.session, status },
      checkoutToken,
    },
  };
}

describe("checkout model", () => {
  it("normalizes the preview without recomputing backend financial values", () => {
    const model = normalizeCheckout(preview);
    assert.equal(model.businessAmount, 41.5);
    assert.equal(model.items[0]?.lineTotal, 41.5);
    assert.deepEqual(model.paymentOptions.map((option) => option.method), ["CASH", "YAPE", "CARD"]);
    assert.equal(model.checkoutToken, "checkout-version-17");
  });

  for (const method of ["CASH", "YAPE", "CARD"] as const) {
    it(`preserves authoritative ${method} values`, () => {
      const model = normalizeCheckout(preview);
      assert.deepEqual(
        model.paymentOptions.find((option) => option.method === method),
        preview.paymentOptions[method],
      );
    });
  }

  it("propagates checkoutToken as expectedCheckoutToken", () => {
    assert.deepEqual(paymentPayload("YAPE", preview.checkoutToken), {
      method: "YAPE",
      expectedCheckoutToken: "checkout-version-17",
    });
  });

  it("distinguishes economic changes from lifecycle-only token refresh", () => {
    const reviewed = normalizeCheckout(previewResult("OPEN", "old-token").checkout);
    assert.equal(
      checkoutEconomicsMatch(reviewed, previewResult("AWAITING_PAYMENT", "fresh-token").checkout),
      true,
    );
    assert.equal(
      checkoutEconomicsMatch(reviewed, {
        ...previewResult("AWAITING_PAYMENT", "status-token").checkout,
        items: preview.items.map((item) => ({ ...item, status: "PREPARING" })),
      }),
      true,
    );
    assert.equal(
      checkoutEconomicsMatch(reviewed, {
        ...previewResult("AWAITING_PAYMENT", "changed-token").checkout,
        businessAmount: 99,
      }),
      false,
    );
  });

  it("keeps preview and charge capabilities independent", () => {
    assert.deepEqual(checkoutPermissions(["tables.operate"]), {
      canPreview: true,
      canCharge: false,
    });
    assert.deepEqual(checkoutPermissions(["tables.operate", "payments.charge"]), {
      canPreview: true,
      canCharge: true,
    });
  });

  it("provides a true read-only payment state", () => {
    assert.equal(paymentSubmissionAllowed({
      canCharge: false,
      inFlight: false,
      unresolved: false,
      completed: false,
    }), false);
  });

  it("blocks double-submit while the first payment is in flight", async () => {
    const lock = { current: false };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const first = runWithPaymentLock(lock, async () => { calls += 1; await pending; });
    const second = await runWithPaymentLock(lock, async () => { calls += 1; });
    assert.equal(second, undefined);
    assert.equal(calls, 1);
    release();
    await first;
  });

  it("classifies active, paid and closed reconciliation states", () => {
    assert.equal(checkoutReconciliationDecision(reconciliation("OPEN")), "active");
    assert.equal(checkoutReconciliationDecision(reconciliation("PAID")), "paid");
    assert.equal(checkoutReconciliationDecision(reconciliation("CANCELLED")), "closed");
  });

  it("refreshes checkout after CHECKOUT_CHANGED without retrying payment", async () => {
    let payCalls = 0;
    const result = await executePaymentAttempt({
      pay: async () => { payCalls += 1; throw new Error("changed"); },
      reconcile: async () => reconciliation("OPEN"),
      refreshPreview: async () => ({ checkout: { ...preview, checkoutToken: "fresh-token" } }),
      classifyFailure: () => "checkout-changed",
    });
    assert.equal(result.kind, "checkout-changed");
    assert.equal(payCalls, 1);
    if (result.kind === "checkout-changed") assert.equal(result.preview.checkout.checkoutToken, "fresh-token");
  });

  it("reconciles an ambiguous payment as paid without retry", async () => {
    let payCalls = 0;
    const result = await executePaymentAttempt({
      pay: async () => { payCalls += 1; throw new Error("timeout"); },
      reconcile: async () => reconciliation("PAID"),
      refreshPreview: async () => ({ checkout: preview }),
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "ambiguous-paid");
    assert.equal(payCalls, 1);
  });

  it("allows a reviewed retry only after ambiguous state is proven active", async () => {
    const result = await executePaymentAttempt({
      pay: async () => { throw new Error("network"); },
      reconcile: async () => reconciliation("AWAITING_PAYMENT"),
      refreshPreview: async () => ({ checkout: preview }),
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "ambiguous-active");
  });

  it("keeps a second charge blocked while reconciliation is unresolved", async () => {
    const result = await executePaymentAttempt({
      pay: async () => { throw new Error("network"); },
      reconcile: async () => { throw new Error("offline"); },
      refreshPreview: async () => ({ checkout: preview }),
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "unresolved");
    assert.equal(paymentSubmissionAllowed({
      canCharge: true,
      inFlight: false,
      unresolved: result.kind === "unresolved",
      completed: false,
    }), false);
  });

  it("reconciles after a confirmed successful payment", async () => {
    const result = await executePaymentAttempt({
      pay: async () => payment,
      reconcile: async () => reconciliation("PAID"),
      refreshPreview: async () => ({ checkout: preview }),
      classifyFailure: () => "other",
    });
    assert.equal(result.kind, "confirmed");
    if (result.kind === "confirmed") {
      assert.equal(result.reconciliation.session.status, "PAID");
      assert.equal(paymentOperationallyClosed(result.reconciliation, "session-1"), true);
      assert.equal(paymentOperationallyClosed({
        ...result.reconciliation,
        points: [{
          id: "point-1",
          name: "Mesa 1",
          type: "TABLE",
          sortOrder: 1,
          isActive: true,
          isOccupied: true,
          activeSession: {
            id: "session-1",
            status: "AWAITING_PAYMENT",
            openedAt: "2026-09-07T12:00:00.000Z",
          },
        }],
      }, "session-1"), false);
    }
  });

  it("moves OPEN to AWAITING_PAYMENT and only then submits payment with the current token", async () => {
    const calls: string[] = [];
    let paidToken = "";
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(previewResult("OPEN", "old-token").checkout),
      readSession: async () => {
        calls.push("read:open");
        return reconciliation("OPEN").session;
      },
      awaitPayment: async () => {
        calls.push("await-payment");
        return { session: reconciliation("AWAITING_PAYMENT").session };
      },
      refreshPreview: async () => {
        calls.push("preview:awaiting");
        return previewResult("AWAITING_PAYMENT", "current-token");
      },
      pay: async (token) => {
        calls.push("payment");
        paidToken = token;
        return payment;
      },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "deterministic",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "payment");
    assert.equal(paidToken, "current-token");
    assert.deepEqual(calls, ["read:open", "await-payment", "preview:awaiting", "payment"]);
  });

  it("does not repeat await-payment when the session is already AWAITING_PAYMENT", async () => {
    let awaitCalls = 0;
    let payCalls = 0;
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(preview),
      readSession: async () => reconciliation("AWAITING_PAYMENT").session,
      awaitPayment: async () => {
        awaitCalls += 1;
        return { session: reconciliation("AWAITING_PAYMENT").session };
      },
      refreshPreview: async () => previewResult("AWAITING_PAYMENT"),
      pay: async () => { payCalls += 1; return payment; },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "deterministic",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "payment");
    assert.equal(awaitCalls, 0);
    assert.equal(payCalls, 1);
  });

  it("prevents payment after a deterministic await-payment failure", async () => {
    let payCalls = 0;
    const transitionError = { kind: "conflict" as const, code: "INVALID_SESSION_TRANSITION" };
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(previewResult("OPEN").checkout),
      readSession: async () => reconciliation("OPEN").session,
      awaitPayment: async () => { throw transitionError; },
      refreshPreview: async () => previewResult("AWAITING_PAYMENT"),
      pay: async () => { payCalls += 1; return payment; },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "deterministic",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "await-payment-failed");
    assert.equal(payCalls, 0);
  });

  it("reconciles ambiguous await-payment before allowing payment", async () => {
    let reads = 0;
    let payCalls = 0;
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(previewResult("OPEN").checkout),
      readSession: async () => {
        reads += 1;
        return reconciliation(reads === 1 ? "OPEN" : "AWAITING_PAYMENT").session;
      },
      awaitPayment: async () => { throw new Error("timeout"); },
      refreshPreview: async () => previewResult("AWAITING_PAYMENT"),
      pay: async () => { payCalls += 1; return payment; },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "ambiguous",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "payment");
    assert.equal(reads, 2);
    assert.equal(payCalls, 1);
  });

  it("does not pay when ambiguous await-payment reconciles to OPEN", async () => {
    let payCalls = 0;
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(previewResult("OPEN").checkout),
      readSession: async () => reconciliation("OPEN").session,
      awaitPayment: async () => { throw new Error("timeout"); },
      refreshPreview: async () => previewResult("AWAITING_PAYMENT"),
      pay: async () => { payCalls += 1; return payment; },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "ambiguous",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "await-payment-not-applied");
    assert.equal(payCalls, 0);
  });

  it("blocks payment when ambiguous await-payment cannot be reconciled", async () => {
    let reads = 0;
    let payCalls = 0;
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(previewResult("OPEN").checkout),
      readSession: async () => {
        reads += 1;
        if (reads > 1) throw new Error("offline");
        return reconciliation("OPEN").session;
      },
      awaitPayment: async () => { throw new Error("timeout"); },
      refreshPreview: async () => previewResult("AWAITING_PAYMENT"),
      pay: async () => { payCalls += 1; return payment; },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "ambiguous",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "await-payment-unresolved");
    assert.equal(payCalls, 0);
  });

  it("stops before payment when the refreshed checkout economics changed", async () => {
    let payCalls = 0;
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(preview),
      readSession: async () => reconciliation("AWAITING_PAYMENT").session,
      awaitPayment: async () => ({ session: reconciliation("AWAITING_PAYMENT").session }),
      refreshPreview: async () => ({
        checkout: { ...preview, businessAmount: 99, checkoutToken: "changed" },
      }),
      pay: async () => { payCalls += 1; return payment; },
      reconcilePayment: async () => reconciliation("PAID"),
      classifyAwaitFailure: () => "deterministic",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "checkout-changed-before-payment");
    assert.equal(payCalls, 0);
  });

  it("keeps confirmed payment terminal even when operational reconciliation fails", async () => {
    const result = await executeCheckoutLifecycle({
      reviewedCheckout: normalizeCheckout(preview),
      readSession: async () => reconciliation("AWAITING_PAYMENT").session,
      awaitPayment: async () => ({ session: reconciliation("AWAITING_PAYMENT").session }),
      refreshPreview: async () => previewResult("AWAITING_PAYMENT"),
      pay: async () => payment,
      reconcilePayment: async () => { throw new Error("refresh failed"); },
      classifyAwaitFailure: () => "deterministic",
      classifyPaymentFailure: () => "other",
    });
    assert.equal(result.kind, "payment");
    if (result.kind === "payment") {
      assert.equal(result.result.kind, "confirmed-reconciliation-failed");
    }
    assert.equal(paymentSubmissionAllowed({
      canCharge: true,
      inFlight: false,
      unresolved: false,
      completed: true,
    }), false);
  });

  it("maps CHECKOUT_CHANGED and network ambiguity safely", () => {
    assert.equal(paymentFailureKind({ kind: "conflict", code: "CHECKOUT_CHANGED" }), "checkout-changed");
    assert.equal(paymentFailureKind({ kind: "network" }), "ambiguous");
    assert.match(checkoutErrorMessage({ kind: "conflict", code: "CHECKOUT_CHANGED" }), /cuenta cambió/i);
  });

  it("keeps CHECKOUT_CHANGED distinct from session lifecycle conflicts", () => {
    assert.equal(
      paymentFailureKind({ kind: "conflict", code: "INVALID_SESSION_TRANSITION" }),
      "other",
    );
    assert.equal(sessionTransitionFailureKind({ kind: "conflict" }), "deterministic");
    assert.match(
      checkoutErrorMessage({ kind: "conflict", code: "INVALID_SESSION_TRANSITION" }),
      /cambió de estado/i,
    );
  });
});
