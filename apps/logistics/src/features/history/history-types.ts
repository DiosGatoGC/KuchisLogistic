import type { UserRole } from "@/types/auth";

export interface HistoricalActor {
  id: string;
  fullName: string | null;
  fullNameSource: "CURRENT_PROFILE";
  role: UserRole | null;
}

export interface HistoryListItem {
  shiftId: string;
  openedAt: string;
  closedAt: string;
  openedBy: HistoricalActor | null;
  closedBy: HistoricalActor | null;
  businessSalesTotal: number;
  cashTotal: number;
  yapeTotal: number;
  cardTotal: number;
  cardFeeTotal: number;
  customerCardTotal: number;
  operationalExpensesTotal: number;
  serviceSessionsCount: number;
  ordersCount: number;
  reconciliationExists: boolean;
}

export interface HistoryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface HistoryListResult {
  items: HistoryListItem[];
  pagination: HistoryPagination;
}

export interface HistoryShift {
  id: string;
  status: "CLOSED";
  openingCash: number;
  openedAt: string;
  closedAt: string;
  openedBy: HistoricalActor | null;
  closedBy: HistoricalActor | null;
}

export interface HistoryClosure {
  id: string;
  shiftId: string;
  closedBy: HistoricalActor | null;
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
  expectedCashAtClose: number;
}

export interface HistoryReconciliation {
  id: string;
  shiftId: string;
  reconciledBy: HistoricalActor | null;
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

export interface HistoryServicePoint {
  id: string;
  name: string | null;
  type: string | null;
  nameSource: "CURRENT_SERVICE_POINT";
}

export interface HistorySession {
  id: string;
  shiftId: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openedBy: HistoricalActor | null;
  closedBy: HistoricalActor | null;
  cancellationReason: string | null;
  servicePoint: HistoryServicePoint;
}

export interface HistoryAddition {
  id: string;
  productId: string;
  additionName: string;
  unitPrice: number;
  quantityPerItem: number;
  createdAt: string;
}

export interface HistoryOrderItem {
  id: string;
  orderId: string;
  currentServiceSessionId: string;
  lineNumber: number;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes: string | null;
  preparationStation: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  preparingAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancellation: {
    cancelledAt: string | null;
    cancelledFromStatus: string | null;
    reason: string | null;
    cancelledBy: HistoricalActor | null;
  } | null;
  additions: HistoryAddition[];
}

export interface HistoryOrder {
  id: string;
  originalServiceSessionId: string;
  sequenceNumber: number;
  notes: string | null;
  sentAt: string;
  createdAt: string;
  createdBy: HistoricalActor | null;
  items: HistoryOrderItem[];
}

export interface HistoryPayment {
  id: string;
  serviceSessionId: string;
  method: string;
  businessAmount: number;
  feeRate: number;
  feeAmount: number;
  customerTotal: number;
  paidAt: string;
  receivedBy: HistoricalActor | null;
}

export interface HistoryExpense {
  id: string;
  category: string;
  customCategory: string | null;
  description: string;
  amount: number;
  recordedAt: string;
  recordedBy: HistoricalActor | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: HistoricalActor | null;
}

export interface HistoryTransferPoint {
  id: string;
  name: string;
  nameSource: "TRANSFER_SNAPSHOT";
}

export interface HistorySessionTransfer {
  id: string;
  serviceSessionId: string;
  fromServicePoint: HistoryTransferPoint;
  toServicePoint: HistoryTransferPoint;
  reason: string;
  transferredAt: string;
  transferredBy: HistoricalActor | null;
}

export interface HistoryItemTransfer {
  id: string;
  orderItemId: string;
  fromServiceSessionId: string;
  toServiceSessionId: string;
  fromServicePoint: HistoryTransferPoint;
  toServicePoint: HistoryTransferPoint;
  quantity: number;
  statusAtTransfer: string;
  reason: string;
  transferredAt: string;
  transferredBy: HistoricalActor | null;
}

export interface HistoryAuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  serviceSessionId: string | null;
  actor: HistoricalActor | null;
  details: unknown;
  createdAt: string;
}

export interface HistoryDetail {
  shift: HistoryShift;
  closure: HistoryClosure;
  reconciliation: HistoryReconciliation | null;
  serviceSessions: HistorySession[];
  orders: HistoryOrder[];
  payments: HistoryPayment[];
  expenses: HistoryExpense[];
  transfers: {
    serviceSessions: HistorySessionTransfer[];
    orderItems: HistoryItemTransfer[];
  };
  audit: HistoryAuditEntry[];
}

export interface HistoryDetailResult {
  history: HistoryDetail;
}
