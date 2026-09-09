import { ApiError } from "@/lib/api/client";

import type { ExpenseMutationFailureKind } from "./expense-mutations";
import { expenseErrorMessage, expenseMutationFailureKind } from "./expenses-error-model";

export function expensesApiErrorMessage(error: unknown, fallback?: string) {
  return error instanceof ApiError ? expenseErrorMessage(error, fallback) : fallback ?? "No se pudo completar la operación de gastos.";
}

export function classifyExpenseMutationFailure(error: unknown): ExpenseMutationFailureKind {
  return error instanceof ApiError ? expenseMutationFailureKind(error) : "other";
}
