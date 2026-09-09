import type { UserRole } from "@/types/auth";

export interface Shift {
  id: string;
  status: "OPEN" | "CLOSED";
  openingCash: number;
  openedAt: string;
  closedAt: string | null;
  openedBy: { id: string; role: UserRole };
  closedBy: { id: string; role: UserRole } | null;
}

export interface CurrentShiftResult {
  shift: Shift | null;
}

export interface OpenShiftResult {
  shift: Shift;
}

export interface ShiftClosure {
  id: string;
  shiftId: string;
  closedBy: { id: string; role: UserRole };
  createdAt: string;
  businessSalesTotal: number;
  cashTotal: number;
  yapeTotal: number;
  cardTotal: number;
  cardFeeTotal: number;
  customerCardTotal: number;
  operationalExpensesCount: number;
  operationalExpensesTotal: number;
  serviceSessionsCount: number;
  cancelledSessionsCount: number;
  ordersCount: number;
  orderItemsCount: number;
  productUnitsCount: number;
  cancelledOrderItemsCount: number;
  cancelledPendingCount: number;
  cancelledPreparingCount: number;
  cancelledReadyCount: number;
  cancelledDeliveredCount: number;
  serviceSessionTransfersCount: number;
  orderItemTransfersCount: number;
  closingNotes: string | null;
  summary: unknown;
}

export interface ShiftClosureResult {
  shift: Shift;
  closure: ShiftClosure;
  expectedCashAtClose: number;
}

export interface CloseShiftSnapshot {
  closureId: string;
  shiftId: string;
  shiftStatus: "CLOSED";
  closedAt: string;
  closedBy: string;
  closedByRole: UserRole;
  openingCash: number;
  businessSalesTotal: number;
  cashTotal: number;
  yapeTotal: number;
  cardTotal: number;
  cardFeeTotal: number;
  customerCardTotal: number;
  operationalExpensesCount: number;
  operationalExpensesTotal: number;
  expectedCashAtClose: number;
  serviceSessionsCount: number;
  cancelledSessionsCount: number;
  ordersCount: number;
  orderItemsCount: number;
  productUnitsCount: number;
  cancelledOrderItemsCount: number;
  cancelledPendingCount: number;
  cancelledPreparingCount: number;
  cancelledReadyCount: number;
  cancelledDeliveredCount: number;
  serviceSessionTransfersCount: number;
  orderItemTransfersCount: number;
  closingNotes: string | null;
  summary: unknown;
}

export interface CloseShiftResult {
  closure: CloseShiftSnapshot;
}

export interface CashReconciliation {
  id: string;
  shiftId: string;
  reconciledBy: { id: string; role: UserRole };
  createdAt: string;
  openingCashSnapshot: number;
  cashSalesExpected: number;
  cashExpensesSnapshot: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
  expectedYape: number;
  confirmedYape: number;
  yapeDifference: number;
  expectedCardBusiness: number;
  expectedCardFee: number;
  expectedCardCustomerTotal: number;
  confirmedCardCustomerTotal: number;
  cardDifference: number;
  notes: string | null;
}

export interface CashReconciliationResult {
  reconciliation: CashReconciliation;
}

export interface ReconcileShiftInput {
  countedCash: number;
  confirmedYape: number;
  confirmedCardCustomerTotal: number;
  notes: string | null;
}
