import type { Database } from "@kuchis/shared/database-types";

export type ExpenseRow = Database["public"]["Tables"]["shift_expenses"]["Row"];
export type ExpenseCategory = Database["public"]["Enums"]["expense_category"];
export type ExpenseProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name"
>;

export interface ExpenseAggregate {
  expense: ExpenseRow;
  recordedBy: ExpenseProfileRow;
  voidedBy: ExpenseProfileRow | null;
}
