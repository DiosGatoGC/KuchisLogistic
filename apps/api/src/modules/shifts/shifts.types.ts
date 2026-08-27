import type { UserRole } from "../../authorization/roles";
import type { Json } from "@kuchis/shared/database-types";

export interface PublicShift {
  id: string;
  status: "OPEN" | "CLOSED";
  openingCash: number;
  openedAt: string;
  closedAt: string | null;
  openedBy: {
    id: string;
    role: UserRole;
  };
  closedBy: {
    id: string;
    role: UserRole;
  } | null;
}

export interface PublicShiftClosure {
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
  summary: Json;
}

export interface PublicCashReconciliation {
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
