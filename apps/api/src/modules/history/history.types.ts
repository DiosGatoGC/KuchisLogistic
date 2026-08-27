import type { Database } from "@kuchis/shared/database-types";

export type HistoryShiftRow = Database["public"]["Tables"]["shifts"]["Row"];
export type HistoryClosureRow = Database["public"]["Tables"]["shift_closures"]["Row"];
export type HistoryReconciliationRow =
  Database["public"]["Tables"]["cash_reconciliations"]["Row"];
export type HistorySessionRow =
  Database["public"]["Tables"]["service_sessions"]["Row"];
export type HistoryOrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type HistoryItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type HistoryAdditionRow =
  Database["public"]["Tables"]["order_item_additions"]["Row"];
export type HistoryPaymentRow = Database["public"]["Tables"]["payments"]["Row"];
export type HistoryExpenseRow =
  Database["public"]["Tables"]["shift_expenses"]["Row"];
export type HistorySessionTransferRow =
  Database["public"]["Tables"]["service_session_transfers"]["Row"];
export type HistoryItemTransferRow =
  Database["public"]["Tables"]["order_item_transfers"]["Row"];
export type HistoryAuditRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type HistoryPointRow = Pick<
  Database["public"]["Tables"]["service_points"]["Row"],
  "id" | "name" | "type"
>;
export type HistoryProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name"
>;

export interface HistoryListData {
  shifts: HistoryShiftRow[];
  closures: HistoryClosureRow[];
  reconciledShiftIds: string[];
  profiles: HistoryProfileRow[];
  total: number;
}

export interface HistoryDetailData {
  shift: HistoryShiftRow;
  closure: HistoryClosureRow | null;
  reconciliation: HistoryReconciliationRow | null;
  sessions: HistorySessionRow[];
  orders: HistoryOrderRow[];
  items: HistoryItemRow[];
  additions: HistoryAdditionRow[];
  payments: HistoryPaymentRow[];
  expenses: HistoryExpenseRow[];
  sessionTransfers: HistorySessionTransferRow[];
  itemTransfers: HistoryItemTransferRow[];
  audit: HistoryAuditRow[];
  points: HistoryPointRow[];
  profiles: HistoryProfileRow[];
}
