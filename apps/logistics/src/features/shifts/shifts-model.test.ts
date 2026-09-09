import assert from "node:assert/strict";
import test from "node:test";

import { executeOpenShiftAttempt } from "./shift-opening-attempt.ts";
import {
  isCurrentOpenShift,
  openingCashPayload,
  parseMoneyInput,
  runWithShiftLock,
  shiftPermissions,
} from "./shifts-model.ts";
import type { Shift } from "./shifts-types.ts";

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    status: "OPEN",
    openingCash: 0,
    openedAt: "2026-09-09T12:00:00.000Z",
    closedAt: null,
    openedBy: { id: "user-1", role: "CASHIER" },
    closedBy: null,
    ...overrides,
  };
}

test("normaliza ausencia y turno OPEN actual", () => {
  assert.equal(isCurrentOpenShift({ shift: null }), null);
  assert.deepEqual(isCurrentOpenShift({ shift: shift() }), shift());
  assert.equal(isCurrentOpenShift({ shift: shift({ status: "CLOSED" }) }), null);
});

test("construye el payload de apertura y acepta S/ 0.00", () => {
  assert.deepEqual(openingCashPayload(0), { openingCash: 0 });
  assert.deepEqual(parseMoneyInput("0.00", { allowZero: true }), { valid: true, value: 0 });
});

test("valida precisión, rango y signo del monto", () => {
  assert.equal(parseMoneyInput("10.999", { allowZero: true }).valid, false);
  assert.equal(parseMoneyInput("100000000", { allowZero: true }).valid, false);
  assert.equal(parseMoneyInput("-1", { allowZero: true }).valid, false);
  assert.deepEqual(parseMoneyInput("12,50", { allowZero: true }), { valid: true, value: 12.5 });
});

test("las capacidades habilitan apertura sin depender del rol", () => {
  assert.equal(shiftPermissions([]).canOpen, false);
  assert.equal(shiftPermissions(["shift.open"]).canOpen, true);
});

test("el lock síncrono evita doble submit", async () => {
  const lock = { current: false };
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithShiftLock(lock, async () => { calls += 1; await pending; return "ok"; });
  const second = await runWithShiftLock(lock, async () => { calls += 1; return "duplicate"; });
  assert.equal(second, undefined);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, "ok");
});

test("un fallo determinista no ejecuta reconciliación ni retry", async () => {
  let mutations = 0;
  let reads = 0;
  await assert.rejects(() => executeOpenShiftAttempt({
    mutate: async () => { mutations += 1; throw new Error("conflict"); },
    refetch: async () => { reads += 1; return { shift: null }; },
    classifyFailure: () => "other",
  }));
  assert.equal(mutations, 1);
  assert.equal(reads, 0);
});

test("una apertura ambigua se reconcilia a OPEN sin repetir POST", async () => {
  let mutations = 0;
  let reads = 0;
  const result = await executeOpenShiftAttempt({
    mutate: async () => { mutations += 1; throw new Error("network"); },
    refetch: async () => { reads += 1; return { shift: shift() }; },
    classifyFailure: () => "ambiguous",
  });
  assert.equal(result.kind, "reconciled-open");
  assert.equal(mutations, 1);
  assert.equal(reads, 1);
});

test("una apertura ambigua sin turno no afirma éxito ni repite POST", async () => {
  let mutations = 0;
  const result = await executeOpenShiftAttempt({
    mutate: async () => { mutations += 1; throw new Error("network"); },
    refetch: async () => ({ shift: null }),
    classifyFailure: () => "ambiguous",
  });
  assert.equal(result.kind, "reconciled-empty");
  assert.equal(mutations, 1);
});
