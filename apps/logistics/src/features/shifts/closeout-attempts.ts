import type {
  CashReconciliationResult,
  CloseShiftResult,
  OpenShiftResult,
  ShiftClosureResult,
} from "./shifts-types.ts";

export type CloseFailureKind = "reconcile" | "ambiguous" | "other";

export type CloseAttemptResult =
  | { kind: "confirmed"; response: CloseShiftResult; closure: ShiftClosureResult }
  | { kind: "confirmed-closure-failed"; response: CloseShiftResult; closureError: unknown }
  | { kind: "reconciled-closed"; error: unknown; shift: OpenShiftResult; closure: ShiftClosureResult }
  | { kind: "reconciled-open"; error: unknown; shift: OpenShiftResult }
  | { kind: "unresolved"; error: unknown; shiftError?: unknown; closureError?: unknown };

async function reconcileClose(
  error: unknown,
  readShift: () => Promise<OpenShiftResult>,
  readClosure: () => Promise<ShiftClosureResult>,
): Promise<CloseAttemptResult> {
  const [shiftResult, closureResult] = await Promise.allSettled([readShift(), readClosure()]);
  if (shiftResult.status === "fulfilled" && shiftResult.value.shift.status === "OPEN") {
    return { kind: "reconciled-open", error, shift: shiftResult.value };
  }
  if (
    shiftResult.status === "fulfilled"
    && shiftResult.value.shift.status === "CLOSED"
    && closureResult.status === "fulfilled"
  ) {
    return { kind: "reconciled-closed", error, shift: shiftResult.value, closure: closureResult.value };
  }
  return {
    kind: "unresolved",
    error,
    shiftError: shiftResult.status === "rejected" ? shiftResult.reason : undefined,
    closureError: closureResult.status === "rejected" ? closureResult.reason : undefined,
  };
}

export async function executeCloseAttempt({
  mutate,
  readShift,
  readClosure,
  classifyFailure,
}: {
  mutate: () => Promise<CloseShiftResult>;
  readShift: () => Promise<OpenShiftResult>;
  readClosure: () => Promise<ShiftClosureResult>;
  classifyFailure: (error: unknown) => CloseFailureKind;
}): Promise<CloseAttemptResult> {
  let response: CloseShiftResult;
  try {
    response = await mutate();
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    return reconcileClose(error, readShift, readClosure);
  }
  try {
    return { kind: "confirmed", response, closure: await readClosure() };
  } catch (closureError) {
    return { kind: "confirmed-closure-failed", response, closureError };
  }
}

export type ReconciliationFailureKind = "already-exists" | "ambiguous" | "other";

export type ReconciliationAttemptResult =
  | { kind: "confirmed"; response: CashReconciliationResult }
  | { kind: "reconciled-existing"; error: unknown; stored: CashReconciliationResult }
  | { kind: "not-created"; error: unknown }
  | { kind: "unresolved"; error: unknown; readError: unknown };

export async function executeReconciliationAttempt({
  mutate,
  read,
  classifyFailure,
  isNotFound,
}: {
  mutate: () => Promise<CashReconciliationResult>;
  read: () => Promise<CashReconciliationResult>;
  classifyFailure: (error: unknown) => ReconciliationFailureKind;
  isNotFound: (error: unknown) => boolean;
}): Promise<ReconciliationAttemptResult> {
  try {
    return { kind: "confirmed", response: await mutate() };
  } catch (error) {
    if (classifyFailure(error) === "other") throw error;
    try {
      return { kind: "reconciled-existing", error, stored: await read() };
    } catch (readError) {
      return isNotFound(readError)
        ? { kind: "not-created", error }
        : { kind: "unresolved", error, readError };
    }
  }
}
