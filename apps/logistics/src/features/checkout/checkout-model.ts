import type { Capability } from "../../types/auth.ts";
import type {
  CheckoutPaymentOption,
  CheckoutPreview,
  CheckoutReconciliationState,
  PaymentMethod,
} from "./checkout-types.ts";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["CASH", "YAPE", "CARD"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  YAPE: "Yape",
  CARD: "Tarjeta",
};

export interface CheckoutModel {
  session: CheckoutPreview["session"];
  items: CheckoutPreview["items"];
  businessAmount: number;
  paymentOptions: CheckoutPaymentOption[];
  checkoutToken: string;
}

export function normalizeCheckout(preview: CheckoutPreview): CheckoutModel {
  return {
    session: preview.session,
    items: preview.items,
    businessAmount: preview.businessAmount,
    paymentOptions: PAYMENT_METHODS.map((method) => preview.paymentOptions[method]),
    checkoutToken: preview.checkoutToken,
  };
}

export function checkoutPermissions(capabilities: readonly Capability[]) {
  return {
    canPreview: capabilities.includes("tables.operate"),
    canCharge: capabilities.includes("payments.charge"),
  };
}

export function paymentPayload(method: PaymentMethod, checkoutToken: string) {
  return { method, expectedCheckoutToken: checkoutToken } as const;
}

function checkoutEconomicShape(checkout: CheckoutModel | CheckoutPreview) {
  const optionFor = (method: PaymentMethod) => Array.isArray(checkout.paymentOptions)
    ? checkout.paymentOptions.find((option) => option.method === method)
    : checkout.paymentOptions[method];
  return {
    items: checkout.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      additions: item.additions,
      lineTotal: item.lineTotal,
    })),
    businessAmount: checkout.businessAmount,
    paymentOptions: PAYMENT_METHODS.map(optionFor),
  };
}

export function checkoutEconomicsMatch(
  reviewed: CheckoutModel,
  refreshed: CheckoutPreview,
) {
  return JSON.stringify(checkoutEconomicShape(reviewed)) ===
    JSON.stringify(checkoutEconomicShape(refreshed));
}

export type CheckoutReconciliationDecision = "active" | "paid" | "closed";

export function checkoutReconciliationDecision(
  state: CheckoutReconciliationState,
): CheckoutReconciliationDecision {
  if (state.session.status === "PAID") return "paid";
  if (state.session.status === "OPEN" || state.session.status === "AWAITING_PAYMENT") {
    return "active";
  }
  return "closed";
}

export function paymentOperationallyClosed(
  state: CheckoutReconciliationState,
  sessionId: string,
) {
  return state.session.status === "PAID" && !state.points.some(
    (point) => point.activeSession?.id === sessionId,
  );
}

export async function runWithPaymentLock<T>(
  lock: { current: boolean },
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await operation();
  } finally {
    lock.current = false;
  }
}

export function paymentSubmissionAllowed({
  canCharge,
  inFlight,
  unresolved,
  completed,
}: {
  canCharge: boolean;
  inFlight: boolean;
  unresolved: boolean;
  completed: boolean;
}) {
  return canCharge && !inFlight && !unresolved && !completed;
}
