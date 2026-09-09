import type { CurrentExpensesResult, ExpenseResult } from "./expenses-types.ts";

export type ExpenseMutationFailureKind = "ambiguous" | "other";

export type ExpenseMutationResult =
  | { kind: "confirmed"; response: ExpenseResult; current: CurrentExpensesResult }
  | { kind: "confirmed-refetch-failed"; response: ExpenseResult; refetchError: unknown }
  | { kind: "ambiguous"; error: unknown; current: CurrentExpensesResult }
  | { kind: "unresolved"; error: unknown; refetchError: unknown };

export async function executeExpenseMutation({
  mutate,
  refetch,
  classifyFailure,
}: {
  mutate: () => Promise<ExpenseResult>;
  refetch: () => Promise<CurrentExpensesResult>;
  classifyFailure: (error: unknown) => ExpenseMutationFailureKind;
}): Promise<ExpenseMutationResult> {
  let response: ExpenseResult;
  try {
    response = await mutate();
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    try {
      return { kind: "ambiguous", error, current: await refetch() };
    } catch (refetchError) {
      return { kind: "unresolved", error, refetchError };
    }
  }
  try {
    return { kind: "confirmed", response, current: await refetch() };
  } catch (refetchError) {
    return { kind: "confirmed-refetch-failed", response, refetchError };
  }
}
