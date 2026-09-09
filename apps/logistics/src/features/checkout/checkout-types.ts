import type {
  ServicePointStatus,
  ServiceSessionDetail,
  ServiceSessionStatus,
} from "../tables/tables-types";

export type PaymentMethod = "CASH" | "YAPE" | "CARD";

export interface CheckoutPaymentOption {
  method: PaymentMethod;
  businessAmount: number;
  feeRate: number;
  feeAmount: number;
  customerTotal: number;
}

export interface CheckoutPreview {
  session: {
    id: string;
    status: ServiceSessionStatus;
    servicePoint: {
      id: string;
      name: string;
      type: "TABLE" | "BAR" | "TAKEAWAY";
    };
  };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    status: "PENDING" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
    additions: Array<{
      productId: string;
      additionName: string;
      unitPrice: number;
      quantityPerItem: number;
    }>;
    lineTotal: number;
  }>;
  businessAmount: number;
  paymentOptions: Record<PaymentMethod, CheckoutPaymentOption>;
  checkoutToken: string;
}

export interface CheckoutPreviewResult {
  checkout: CheckoutPreview;
}

export interface AwaitPaymentResult {
  session: ServiceSessionDetail;
}

export interface ConfirmPaymentResult {
  payment: {
    paymentId: string;
    serviceSessionId: string;
    shiftId: string;
    method: PaymentMethod;
    businessAmount: number;
    feeRate: number;
    feeAmount: number;
    customerTotal: number;
    paidAt: string;
    sessionStatus: "PAID";
  };
}

export interface CheckoutReconciliationState {
  session: ServiceSessionDetail;
  points: ServicePointStatus[];
}
