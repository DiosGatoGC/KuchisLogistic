import { apiRequest } from "@/lib/api/client";

import type { CurrentExpensesResult, ExpenseResult, RecordExpenseInput } from "./expenses-types";

export function getCurrentExpenses(accessToken: string) {
  return apiRequest<CurrentExpensesResult>("/api/logistics/expenses/current", { accessToken });
}

export function recordExpense(input: RecordExpenseInput, accessToken: string) {
  return apiRequest<ExpenseResult>("/api/logistics/expenses", {
    method: "POST",
    accessToken,
    body: input,
    expectedStatus: 201,
  });
}

export function voidExpense(expenseId: string, reason: string, accessToken: string) {
  return apiRequest<ExpenseResult>(
    `/api/logistics/expenses/${encodeURIComponent(expenseId)}/void`,
    { method: "POST", accessToken, body: { reason } },
  );
}
