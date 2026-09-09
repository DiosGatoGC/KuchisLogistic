import { apiRequest } from "@/lib/api/client";

import type {
  CashReconciliationResult,
  CloseShiftResult,
  CurrentShiftResult,
  OpenShiftResult,
  ReconcileShiftInput,
  ShiftClosureResult,
} from "./shifts-types";

export function getCurrentShift(accessToken: string) {
  return apiRequest<CurrentShiftResult>("/api/logistics/shifts/current", {
    accessToken,
  });
}

export function openShift(openingCash: number, accessToken: string) {
  return apiRequest<OpenShiftResult>("/api/logistics/shifts/open", {
    method: "POST",
    accessToken,
    body: { openingCash },
    expectedStatus: 201,
  });
}

export function getShift(shiftId: string, accessToken: string) {
  return apiRequest<OpenShiftResult>(
    `/api/logistics/shifts/${encodeURIComponent(shiftId)}`,
    { accessToken },
  );
}

export function closeShift(shiftId: string, closingNotes: string | null, accessToken: string) {
  return apiRequest<CloseShiftResult>(
    `/api/logistics/shifts/${encodeURIComponent(shiftId)}/close`,
    { method: "POST", accessToken, body: { closingNotes }, expectedStatus: 201 },
  );
}

export function getShiftClosure(shiftId: string, accessToken: string) {
  return apiRequest<ShiftClosureResult>(
    `/api/logistics/shifts/${encodeURIComponent(shiftId)}/closure`,
    { accessToken },
  );
}

export function reconcileShift(shiftId: string, input: ReconcileShiftInput, accessToken: string) {
  return apiRequest<CashReconciliationResult>(
    `/api/logistics/shifts/${encodeURIComponent(shiftId)}/reconciliation`,
    { method: "POST", accessToken, body: input, expectedStatus: 201 },
  );
}

export function getShiftReconciliation(shiftId: string, accessToken: string) {
  return apiRequest<CashReconciliationResult>(
    `/api/logistics/shifts/${encodeURIComponent(shiftId)}/reconciliation`,
    { accessToken },
  );
}
