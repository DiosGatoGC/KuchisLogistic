import type { Capability } from "../../types/auth.ts";
import type {
  CashReconciliationResult,
  CloseShiftSnapshot,
  ReconcileShiftInput,
  Shift,
  ShiftClosureResult,
} from "./shifts-types.ts";
import { parseMoneyInput } from "./shifts-model.ts";

export interface ClosureSummaryModel {
  shiftId: string;
  closedAt: string;
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
  closingNotes: string | null;
}

export function closeoutPermissions(capabilities: readonly Capability[]) {
  return {
    canReadCurrent: capabilities.includes("shift.open"),
    canClose: capabilities.includes("shift.close"),
    canReconcile: capabilities.includes("cash.reconcile"),
  };
}

export function validateOptionalNotes(notes: string) {
  const normalized = notes.trim();
  if (normalized.length > 500) return { value: null, error: "Las notas admiten hasta 500 caracteres." };
  return { value: normalized || null, error: null };
}

export function closeShiftPayload(closingNotes: string | null) {
  return { closingNotes } as const;
}

export function canConfirmClose({
  shift,
  canClose,
  inFlight,
  unresolved,
  notesValid,
}: {
  shift: Shift | null;
  canClose: boolean;
  inFlight: boolean;
  unresolved: boolean;
  notesValid: boolean;
}) {
  return shift?.status === "OPEN" && canClose && !inFlight && !unresolved && notesValid;
}

export function closureFromCloseResponse(snapshot: CloseShiftSnapshot): ClosureSummaryModel {
  return {
    shiftId: snapshot.shiftId,
    closedAt: snapshot.closedAt,
    openingCash: snapshot.openingCash,
    businessSalesTotal: snapshot.businessSalesTotal,
    cashTotal: snapshot.cashTotal,
    yapeTotal: snapshot.yapeTotal,
    cardTotal: snapshot.cardTotal,
    cardFeeTotal: snapshot.cardFeeTotal,
    customerCardTotal: snapshot.customerCardTotal,
    operationalExpensesCount: snapshot.operationalExpensesCount,
    operationalExpensesTotal: snapshot.operationalExpensesTotal,
    expectedCashAtClose: snapshot.expectedCashAtClose,
    serviceSessionsCount: snapshot.serviceSessionsCount,
    cancelledSessionsCount: snapshot.cancelledSessionsCount,
    ordersCount: snapshot.ordersCount,
    orderItemsCount: snapshot.orderItemsCount,
    productUnitsCount: snapshot.productUnitsCount,
    closingNotes: snapshot.closingNotes,
  };
}

export function closureFromRead(result: ShiftClosureResult): ClosureSummaryModel {
  return {
    shiftId: result.closure.shiftId,
    closedAt: result.shift.closedAt ?? result.closure.createdAt,
    openingCash: result.shift.openingCash,
    businessSalesTotal: result.closure.businessSalesTotal,
    cashTotal: result.closure.cashTotal,
    yapeTotal: result.closure.yapeTotal,
    cardTotal: result.closure.cardTotal,
    cardFeeTotal: result.closure.cardFeeTotal,
    customerCardTotal: result.closure.customerCardTotal,
    operationalExpensesCount: result.closure.operationalExpensesCount,
    operationalExpensesTotal: result.closure.operationalExpensesTotal,
    expectedCashAtClose: result.expectedCashAtClose,
    serviceSessionsCount: result.closure.serviceSessionsCount,
    cancelledSessionsCount: result.closure.cancelledSessionsCount,
    ordersCount: result.closure.ordersCount,
    orderItemsCount: result.closure.orderItemsCount,
    productUnitsCount: result.closure.productUnitsCount,
    closingNotes: result.closure.closingNotes,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isResolvableShiftId(shiftId: string | null) {
  return Boolean(shiftId && UUID_PATTERN.test(shiftId));
}

export function reconciliationPermissions(capabilities: readonly Capability[]) {
  return {
    canReconcile: capabilities.includes("cash.reconcile"),
    canReadClosure: capabilities.includes("shift.close"),
  };
}

export function validateReconciliationInput(input: {
  countedCash: string;
  confirmedYape: string;
  confirmedCardCustomerTotal: string;
  notes: string;
}): { payload: ReconcileShiftInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const countedCash = parseMoneyInput(input.countedCash, { allowZero: true });
  const confirmedYape = parseMoneyInput(input.confirmedYape, { allowZero: true });
  const confirmedCard = parseMoneyInput(input.confirmedCardCustomerTotal, { allowZero: true });
  const notes = validateOptionalNotes(input.notes);
  if (!countedCash.valid) errors.countedCash = countedCash.error;
  if (!confirmedYape.valid) errors.confirmedYape = confirmedYape.error;
  if (!confirmedCard.valid) errors.confirmedCardCustomerTotal = confirmedCard.error;
  if (notes.error) errors.notes = notes.error;
  if (!countedCash.valid || !confirmedYape.valid || !confirmedCard.valid || notes.error) {
    return { payload: null, errors };
  }
  return {
    payload: {
      countedCash: countedCash.value,
      confirmedYape: confirmedYape.value,
      confirmedCardCustomerTotal: confirmedCard.value,
      notes: notes.value,
    },
    errors,
  };
}

export function reconciliationPayload(input: ReconcileShiftInput) {
  return { ...input };
}

export function reconciliationIsTerminal(value: unknown) {
  return value !== null;
}

export function reconciliationFromResult(result: CashReconciliationResult) {
  return result.reconciliation;
}
