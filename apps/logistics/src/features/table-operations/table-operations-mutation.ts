export type CorrectiveFailureKind = "conflict" | "ambiguous" | "other";

export type CorrectiveAttemptResult<TResponse, TState> =
  | { kind: "confirmed"; response: TResponse; state: TState }
  | { kind: "confirmed-refresh-failed"; response: TResponse; refreshError: unknown }
  | { kind: "conflict" | "ambiguous"; error: unknown; state: TState }
  | {
      kind: "reconciliation-failed";
      failureKind: "conflict" | "ambiguous";
      error: unknown;
      refreshError: unknown;
    };

export async function executeCorrectiveAttempt<TResponse, TState>({
  mutate,
  refetch,
  classifyFailure,
}: {
  mutate: () => Promise<TResponse>;
  refetch: () => Promise<TState>;
  classifyFailure: (error: unknown) => CorrectiveFailureKind;
}): Promise<CorrectiveAttemptResult<TResponse, TState>> {
  let response: TResponse;
  try {
    response = await mutate();
  } catch (error) {
    const failureKind = classifyFailure(error);
    if (failureKind === "other") throw error;
    try {
      return { kind: failureKind, error, state: await refetch() };
    } catch (refreshError) {
      return { kind: "reconciliation-failed", failureKind, error, refreshError };
    }
  }

  try {
    return { kind: "confirmed", response, state: await refetch() };
  } catch (refreshError) {
    return { kind: "confirmed-refresh-failed", response, refreshError };
  }
}
