import assert from "node:assert/strict";
import test from "node:test";

import { closeFailureKind, closeoutErrorMessage } from "./closeout-error-model.ts";
import { executeCloseAttempt, executeReconciliationAttempt } from "./closeout-attempts.ts";
import {
  canConfirmClose,
  closeShiftPayload,
  closureFromCloseResponse,
  isResolvableShiftId,
  reconciliationFromResult,
  reconciliationIsTerminal,
  reconciliationPayload,
  validateOptionalNotes,
  validateReconciliationInput,
} from "./closeout-model.ts";
import { runWithShiftLock } from "./shifts-model.ts";
import type {
  CashReconciliation,
  CloseShiftSnapshot,
  Shift,
  ShiftClosureResult,
} from "./shifts-types.ts";

function shift(status: "OPEN" | "CLOSED" = "OPEN"): Shift {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status,
    openingCash: 100,
    openedAt: "2026-09-09T12:00:00.000Z",
    closedAt: status === "CLOSED" ? "2026-09-09T20:00:00.000Z" : null,
    openedBy: { id: "user-1", role: "CASHIER" },
    closedBy: status === "CLOSED" ? { id: "user-1", role: "CASHIER" } : null,
  };
}

function closeSnapshot(overrides: Partial<CloseShiftSnapshot> = {}): CloseShiftSnapshot {
  return {
    closureId: "closure-1",
    shiftId: shift().id,
    shiftStatus: "CLOSED",
    closedAt: "2026-09-09T20:00:00.000Z",
    closedBy: "user-1",
    closedByRole: "CASHIER",
    openingCash: 100,
    businessSalesTotal: 240,
    cashTotal: 120,
    yapeTotal: 70,
    cardTotal: 50,
    cardFeeTotal: 2.5,
    customerCardTotal: 52.5,
    operationalExpensesCount: 2,
    operationalExpensesTotal: 25,
    expectedCashAtClose: 195,
    serviceSessionsCount: 8,
    cancelledSessionsCount: 1,
    ordersCount: 10,
    orderItemsCount: 14,
    productUnitsCount: 18,
    cancelledOrderItemsCount: 1,
    cancelledPendingCount: 1,
    cancelledPreparingCount: 0,
    cancelledReadyCount: 0,
    cancelledDeliveredCount: 0,
    serviceSessionTransfersCount: 0,
    orderItemTransfersCount: 0,
    closingNotes: null,
    summary: {},
    ...overrides,
  };
}

function closureRead(): ShiftClosureResult {
  const snapshot = closeSnapshot();
  return {
    shift: shift("CLOSED"),
    expectedCashAtClose: snapshot.expectedCashAtClose,
    closure: {
      id: snapshot.closureId,
      shiftId: snapshot.shiftId,
      closedBy: { id: snapshot.closedBy, role: snapshot.closedByRole },
      createdAt: snapshot.closedAt,
      businessSalesTotal: snapshot.businessSalesTotal,
      cashTotal: snapshot.cashTotal,
      yapeTotal: snapshot.yapeTotal,
      cardTotal: snapshot.cardTotal,
      cardFeeTotal: snapshot.cardFeeTotal,
      customerCardTotal: snapshot.customerCardTotal,
      operationalExpensesCount: snapshot.operationalExpensesCount,
      operationalExpensesTotal: snapshot.operationalExpensesTotal,
      serviceSessionsCount: snapshot.serviceSessionsCount,
      cancelledSessionsCount: snapshot.cancelledSessionsCount,
      ordersCount: snapshot.ordersCount,
      orderItemsCount: snapshot.orderItemsCount,
      productUnitsCount: snapshot.productUnitsCount,
      cancelledOrderItemsCount: snapshot.cancelledOrderItemsCount,
      cancelledPendingCount: snapshot.cancelledPendingCount,
      cancelledPreparingCount: snapshot.cancelledPreparingCount,
      cancelledReadyCount: snapshot.cancelledReadyCount,
      cancelledDeliveredCount: snapshot.cancelledDeliveredCount,
      serviceSessionTransfersCount: snapshot.serviceSessionTransfersCount,
      orderItemTransfersCount: snapshot.orderItemTransfersCount,
      closingNotes: snapshot.closingNotes,
      summary: {},
    },
  };
}

function reconciliation(overrides: Partial<CashReconciliation> = {}): CashReconciliation {
  return {
    id: "reconciliation-1",
    shiftId: shift().id,
    reconciledBy: { id: "user-1", role: "CASHIER" },
    createdAt: "2026-09-09T20:10:00.000Z",
    openingCashSnapshot: 100,
    cashSalesExpected: 120,
    cashExpensesSnapshot: 25,
    expectedCash: 195,
    countedCash: 190,
    cashDifference: -5,
    expectedYape: 70,
    confirmedYape: 71,
    yapeDifference: 1,
    expectedCardBusiness: 50,
    expectedCardFee: 2.5,
    expectedCardCustomerTotal: 52.5,
    confirmedCardCustomerTotal: 52.5,
    cardDifference: 0,
    notes: null,
    ...overrides,
  };
}

test("sin turno OPEN no se habilita confirmación de cierre", () => {
  assert.equal(canConfirmClose({ shift: null, canClose: true, inFlight: false, unresolved: false, notesValid: true }), false);
  assert.equal(canConfirmClose({ shift: shift("CLOSED"), canClose: true, inFlight: false, unresolved: false, notesValid: true }), false);
});

test("normaliza notas opcionales y construye payload exacto", () => {
  assert.deepEqual(closeShiftPayload(validateOptionalNotes("  Fin normal ").value), { closingNotes: "Fin normal" });
  assert.deepEqual(closeShiftPayload(validateOptionalNotes("  ").value), { closingNotes: null });
});

test("confirmación exige capacidad, estado resuelto y ausencia de submit", () => {
  assert.equal(canConfirmClose({ shift: shift(), canClose: true, inFlight: false, unresolved: false, notesValid: true }), true);
  assert.equal(canConfirmClose({ shift: shift(), canClose: false, inFlight: false, unresolved: false, notesValid: true }), false);
  assert.equal(canConfirmClose({ shift: shift(), canClose: true, inFlight: true, unresolved: false, notesValid: true }), false);
});

test("lock de cierre evita doble submit", async () => {
  const lock = { current: false };
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithShiftLock(lock, async () => { calls += 1; await pending; });
  const second = await runWithShiftLock(lock, async () => { calls += 1; });
  assert.equal(second, undefined);
  assert.equal(calls, 1);
  release();
  await first;
});

test("mapea blockers de cierre estables de forma específica", () => {
  assert.match(closeoutErrorMessage({ kind: "conflict", code: "SHIFT_HAS_ACTIVE_SESSIONS" }), /atenciones activas/);
  assert.match(closeoutErrorMessage({ kind: "conflict", code: "SHIFT_HAS_UNRESOLVED_ITEMS" }), /ítems sin resolver/);
  assert.match(closeoutErrorMessage({ kind: "conflict", code: "SHIFT_CHANGED" }), /cambió/);
  assert.match(closeoutErrorMessage({ kind: "conflict", code: "SHIFT_NOT_CLOSED" }), /no está cerrado|todavía no está cerrado/);
  assert.match(closeoutErrorMessage({ kind: "conflict", code: "CASH_RECONCILIATION_ALREADY_EXISTS" }), /cuadre registrado/);
  assert.equal(closeFailureKind({ kind: "conflict", code: "SHIFT_CHANGED" }), "reconcile");
});

test("cierre ambiguo CLOSED más closure se reconcilia sin retry", async () => {
  let writes = 0;
  const result = await executeCloseAttempt({
    mutate: async () => { writes += 1; throw new Error("network"); },
    readShift: async () => ({ shift: shift("CLOSED") }),
    readClosure: async () => closureRead(),
    classifyFailure: () => "ambiguous",
  });
  assert.equal(result.kind, "reconciled-closed");
  assert.equal(writes, 1);
});

test("cierre ambiguo que sigue OPEN no afirma cierre ni repite POST", async () => {
  let writes = 0;
  const result = await executeCloseAttempt({
    mutate: async () => { writes += 1; throw new Error("network"); },
    readShift: async () => ({ shift: shift("OPEN") }),
    readClosure: async () => { throw new Error("not found"); },
    classifyFailure: () => "ambiguous",
  });
  assert.equal(result.kind, "reconciled-open");
  assert.equal(writes, 1);
});

test("summary usa valores backend incluso si no coinciden con un cálculo frontend", () => {
  const model = closureFromCloseResponse(closeSnapshot({ expectedCashAtClose: 999.99 }));
  assert.equal(model.expectedCashAtClose, 999.99);
  assert.equal(model.businessSalesTotal, 240);
  assert.equal(model.cardFeeTotal, 2.5);
});

test("entrada a Cuadre sin shiftId resoluble queda en estado seguro", () => {
  assert.equal(isResolvableShiftId(null), false);
  assert.equal(isResolvableShiftId("latest"), false);
  assert.equal(isResolvableShiftId(shift().id), true);
});

test("valida cuadre, acepta ceros y crea payload exacto", () => {
  const validated = validateReconciliationInput({ countedCash: "0.00", confirmedYape: "0", confirmedCardCustomerTotal: "0,00", notes: "  Sin ventas " });
  assert.deepEqual(validated.payload, { countedCash: 0, confirmedYape: 0, confirmedCardCustomerTotal: 0, notes: "Sin ventas" });
  assert.deepEqual(reconciliationPayload(validated.payload!), validated.payload);
});

test("cuadre rechaza más de dos decimales", () => {
  assert.equal(validateReconciliationInput({ countedCash: "1.001", confirmedYape: "0", confirmedCardCustomerTotal: "0", notes: "" }).payload, null);
});

test("resultado terminal preserva diferencias con signo", () => {
  const stored = reconciliation({ cashDifference: -5, yapeDifference: 1, cardDifference: 0 });
  const model = reconciliationFromResult({ reconciliation: stored });
  assert.equal(reconciliationIsTerminal(model), true);
  assert.equal(model.cashDifference, -5);
  assert.equal(model.yapeDifference, 1);
  assert.equal(model.cardDifference, 0);
});

test("CASH_RECONCILIATION_ALREADY_EXISTS carga resultado read-only", async () => {
  let writes = 0;
  let reads = 0;
  const result = await executeReconciliationAttempt({
    mutate: async () => { writes += 1; throw new Error("exists"); },
    read: async () => { reads += 1; return { reconciliation: reconciliation() }; },
    classifyFailure: () => "already-exists",
    isNotFound: () => false,
  });
  assert.equal(result.kind, "reconciled-existing");
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});

test("POST ambiguo consulta una vez y nunca reintenta", async () => {
  let writes = 0;
  const result = await executeReconciliationAttempt({
    mutate: async () => { writes += 1; throw new Error("timeout"); },
    read: async () => ({ reconciliation: reconciliation() }),
    classifyFailure: () => "ambiguous",
    isNotFound: () => false,
  });
  assert.equal(result.kind, "reconciled-existing");
  assert.equal(writes, 1);
});

test("POST ambiguo sin cuadre no afirma éxito ni duplica submit", async () => {
  let writes = 0;
  const result = await executeReconciliationAttempt({
    mutate: async () => { writes += 1; throw new Error("timeout"); },
    read: async () => { throw new Error("not found"); },
    classifyFailure: () => "ambiguous",
    isNotFound: () => true,
  });
  assert.equal(result.kind, "not-created");
  assert.equal(writes, 1);
});

test("lock de cuadre evita una segunda ejecución concurrente", async () => {
  const lock = { current: false };
  let writes = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithShiftLock(lock, async () => { writes += 1; await pending; });
  const duplicate = await runWithShiftLock(lock, async () => { writes += 1; });
  assert.equal(duplicate, undefined);
  assert.equal(writes, 1);
  release();
  await first;
});
