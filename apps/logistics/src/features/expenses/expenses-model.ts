import type { Capability } from "../../types/auth.ts";
import { parseMoneyInput } from "../shifts/shifts-model.ts";
import type {
  CurrentExpensesResult,
  Expense,
  ExpenseCategory,
  RecordExpenseInput,
} from "./expenses-types.ts";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SUPPLIES: "Insumos",
  CLEANING: "Limpieza",
  OTHER: "Otro",
};

export function expensePermissions(capabilities: readonly Capability[]) {
  return {
    canView: capabilities.includes("expenses.view"),
    canManage: capabilities.includes("expenses.manage"),
    canOpenShift: capabilities.includes("shift.open"),
  };
}

export function validateRecordExpense({
  category,
  customCategory,
  description,
  amount,
}: {
  category: ExpenseCategory;
  customCategory: string;
  description: string;
  amount: string;
}): { payload: RecordExpenseInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const normalizedCustomCategory = customCategory.trim();
  const normalizedDescription = description.trim();
  const parsedAmount = parseMoneyInput(amount, { allowZero: false });

  if (category === "OTHER" && !normalizedCustomCategory) {
    errors.customCategory = "Especifica la categoría del gasto.";
  } else if (normalizedCustomCategory.length > 80) {
    errors.customCategory = "La categoría admite hasta 80 caracteres.";
  }
  if (!normalizedDescription) errors.description = "La descripción es obligatoria.";
  else if (normalizedDescription.length > 300) errors.description = "La descripción admite hasta 300 caracteres.";
  if (!parsedAmount.valid) errors.amount = parsedAmount.error;

  if (Object.keys(errors).length > 0 || !parsedAmount.valid) return { payload: null, errors };
  return {
    payload: {
      category,
      customCategory: category === "OTHER" ? normalizedCustomCategory : null,
      description: normalizedDescription,
      amount: parsedAmount.value,
    },
    errors,
  };
}

export function validateVoidReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) return { value: null, error: "El motivo es obligatorio." };
  if (normalized.length > 300) return { value: null, error: "El motivo admite hasta 300 caracteres." };
  return { value: normalized, error: null };
}

export function canOfferExpenseVoid(
  expense: Pick<Expense, "voided">,
  canManage: boolean,
  unresolved: boolean,
) {
  return canManage && !expense.voided && !unresolved;
}

export type ExpenseReconciliationDecision = "applied" | "unchanged" | "ambiguous";

export function reconcileCreatedExpense(
  before: readonly Expense[],
  after: readonly Expense[],
  input: RecordExpenseInput,
): ExpenseReconciliationDecision {
  const previousIds = new Set(before.map((expense) => expense.id));
  const candidates = after.filter((expense) => (
    !previousIds.has(expense.id)
    && expense.category === input.category
    && expense.customCategory === input.customCategory
    && expense.description === input.description
    && expense.amount === input.amount
  ));
  if (candidates.length === 1) return "applied";
  if (candidates.length === 0) return "unchanged";
  return "ambiguous";
}

export function reconcileVoidedExpense(
  expenses: readonly Expense[],
  expenseId: string,
): ExpenseReconciliationDecision {
  const expense = expenses.find((candidate) => candidate.id === expenseId);
  if (!expense) return "ambiguous";
  return expense.voided ? "applied" : "unchanged";
}

export async function runWithExpenseLock<T>(
  locks: Set<string>,
  key: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try {
    return await operation();
  } finally {
    locks.delete(key);
  }
}

export function normalizeCurrentExpenses(result: CurrentExpensesResult) {
  return {
    ...result,
    expenses: [...result.expenses],
  };
}
