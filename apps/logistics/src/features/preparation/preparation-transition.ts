import type {
  PreparationQueueItem,
  TransitionResponse,
} from "./preparation-types.ts";

export type TransitionFailureKind = "conflict" | "ambiguous" | "other";

type TransitionAttemptResult =
  | {
      kind: "confirmed";
      items: PreparationQueueItem[];
      response: TransitionResponse;
    }
  | {
      kind: "confirmed-refresh-failed";
      response: TransitionResponse;
      refreshError: unknown;
    }
  | {
      kind: "conflict" | "ambiguous";
      items: PreparationQueueItem[];
      error: unknown;
    }
  | {
      kind: "reconciliation-failed";
      failureKind: "conflict" | "ambiguous";
      error: unknown;
      refreshError: unknown;
    };

export async function executeTransitionAttempt({
  mutate,
  refetch,
  classifyFailure,
}: {
  mutate: () => Promise<TransitionResponse>;
  refetch: () => Promise<PreparationQueueItem[]>;
  classifyFailure: (error: unknown) => TransitionFailureKind;
}): Promise<TransitionAttemptResult> {
  let response: TransitionResponse;
  try {
    response = await mutate();
  } catch (error) {
    const failureKind = classifyFailure(error);
    if (failureKind === "other") throw error;
    try {
      return { kind: failureKind, items: await refetch(), error };
    } catch (refreshError) {
      return { kind: "reconciliation-failed", failureKind, error, refreshError };
    }
  }

  try {
    return { kind: "confirmed", items: await refetch(), response };
  } catch (refreshError) {
    return { kind: "confirmed-refresh-failed", response, refreshError };
  }
}
