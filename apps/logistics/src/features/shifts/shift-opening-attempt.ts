import type { CurrentShiftResult, OpenShiftResult } from "./shifts-types.ts";

export type ShiftMutationFailureKind = "ambiguous" | "other";

export type OpenShiftAttemptResult =
  | { kind: "confirmed"; response: OpenShiftResult; current: CurrentShiftResult }
  | { kind: "confirmed-refetch-failed"; response: OpenShiftResult; refetchError: unknown }
  | { kind: "reconciled-open"; error: unknown; current: CurrentShiftResult }
  | { kind: "reconciled-empty"; error: unknown; current: CurrentShiftResult }
  | { kind: "unresolved"; error: unknown; refetchError: unknown };

export async function executeOpenShiftAttempt({
  mutate,
  refetch,
  classifyFailure,
}: {
  mutate: () => Promise<OpenShiftResult>;
  refetch: () => Promise<CurrentShiftResult>;
  classifyFailure: (error: unknown) => ShiftMutationFailureKind;
}): Promise<OpenShiftAttemptResult> {
  let response: OpenShiftResult;
  try {
    response = await mutate();
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    try {
      const current = await refetch();
      return current.shift?.status === "OPEN"
        ? { kind: "reconciled-open", error, current }
        : { kind: "reconciled-empty", error, current };
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
