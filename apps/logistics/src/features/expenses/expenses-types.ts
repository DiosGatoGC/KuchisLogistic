import type { UserRole } from "@/types/auth";

export type ExpenseCategory = "SUPPLIES" | "CLEANING" | "OTHER";

export interface ExpenseActor {
  id: string;
  fullName: string;
  role: UserRole;
}

export interface Expense {
  id: string;
  shiftId: string;
  category: ExpenseCategory;
  customCategory: string | null;
  description: string;
  amount: number;
  recordedAt: string;
  recordedBy: ExpenseActor;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: ExpenseActor | null;
}

export interface CurrentExpensesResult {
  shift: { id: string } | null;
  expenses: Expense[];
  activeExpensesCount: number;
  activeExpensesTotal: number;
}

export interface ExpenseResult {
  expense: Expense;
}

export interface RecordExpenseInput {
  category: ExpenseCategory;
  customCategory: string | null;
  description: string;
  amount: number;
}
