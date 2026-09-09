import assert from "node:assert/strict";
import test from "node:test";

import { executeExpenseMutation } from "./expense-mutations.ts";
import {
  canOfferExpenseVoid,
  expensePermissions,
  normalizeCurrentExpenses,
  reconcileCreatedExpense,
  reconcileVoidedExpense,
  runWithExpenseLock,
  validateRecordExpense,
  validateVoidReason,
} from "./expenses-model.ts";
import type { CurrentExpensesResult, Expense } from "./expenses-types.ts";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    shiftId: "shift-1",
    category: "SUPPLIES",
    customCategory: null,
    description: "Servilletas",
    amount: 12.5,
    recordedAt: "2026-09-09T12:00:00.000Z",
    recordedBy: { id: "user-1", fullName: "Ana", role: "MANAGER" },
    voided: false,
    voidedAt: null,
    voidReason: null,
    voidedBy: null,
    ...overrides,
  };
}

function current(expenses: Expense[] = []): CurrentExpensesResult {
  const active = expenses.filter((row) => !row.voided);
  return {
    shift: { id: "shift-1" },
    expenses,
    activeExpensesCount: active.length,
    activeExpensesTotal: active.reduce((sum, row) => sum + row.amount, 0),
  };
}

test("acepta como estado válido la ausencia de turno", () => {
  const result: CurrentExpensesResult = { shift: null, expenses: [], activeExpensesCount: 0, activeExpensesTotal: 0 };
  assert.deepEqual(result, { shift: null, expenses: [], activeExpensesCount: 0, activeExpensesTotal: 0 });
});

test("normaliza gastos actuales y preserva los totales activos autoritativos", () => {
  const rows = [expense(), expense({ id: "expense-2", amount: 7, voided: true, voidReason: "Duplicado" })];
  const normalized = normalizeCurrentExpenses({
    shift: { id: "shift-1" },
    expenses: rows,
    activeExpensesCount: 1,
    activeExpensesTotal: 12.5,
  });
  assert.equal(normalized.expenses.length, 2);
  assert.equal(normalized.expenses[1]?.voided, true);
  assert.equal(normalized.activeExpensesCount, 1);
  assert.equal(normalized.activeExpensesTotal, 12.5);
});

test("construye payload SUPPLIES sin categoría personalizada", () => {
  const result = validateRecordExpense({ category: "SUPPLIES", customCategory: "ignorada", description: "  Servilletas ", amount: "12.50" });
  assert.deepEqual(result.payload, { category: "SUPPLIES", customCategory: null, description: "Servilletas", amount: 12.5 });
});

test("construye payload CLEANING sin categoría personalizada", () => {
  const result = validateRecordExpense({ category: "CLEANING", customCategory: "", description: "Detergente", amount: "3" });
  assert.deepEqual(result.payload, { category: "CLEANING", customCategory: null, description: "Detergente", amount: 3 });
});

test("OTHER exige categoría personalizada válida", () => {
  assert.equal(validateRecordExpense({ category: "OTHER", customCategory: "", description: "Taxi", amount: "10" }).payload, null);
  assert.deepEqual(
    validateRecordExpense({ category: "OTHER", customCategory: "  Movilidad ", description: " Taxi ", amount: "10" }).payload,
    { category: "OTHER", customCategory: "Movilidad", description: "Taxi", amount: 10 },
  );
});

test("el monto debe ser positivo y admite máximo dos decimales", () => {
  assert.equal(validateRecordExpense({ category: "SUPPLIES", customCategory: "", description: "A", amount: "0" }).payload, null);
  assert.equal(validateRecordExpense({ category: "SUPPLIES", customCategory: "", description: "A", amount: "1.001" }).payload, null);
});

test("expenses.view y expenses.manage se mantienen independientes", () => {
  assert.deepEqual(expensePermissions(["expenses.view"]), { canView: true, canManage: false, canOpenShift: false });
  assert.deepEqual(expensePermissions(["expenses.view", "expenses.manage"]), { canView: true, canManage: true, canOpenShift: false });
});

test("el lock evita doble creación para la misma clave", async () => {
  const locks = new Set<string>();
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithExpenseLock(locks, "create", async () => { calls += 1; await pending; });
  const second = await runWithExpenseLock(locks, "create", async () => { calls += 1; });
  assert.equal(second, undefined);
  assert.equal(calls, 1);
  release();
  await first;
});

test("creación ambigua hace una lectura y nunca repite POST", async () => {
  let writes = 0;
  let reads = 0;
  const result = await executeExpenseMutation({
    mutate: async () => { writes += 1; throw new Error("network"); },
    refetch: async () => { reads += 1; return current([expense()]); },
    classifyFailure: () => "ambiguous",
  });
  assert.equal(result.kind, "ambiguous");
  assert.equal(writes, 1);
  assert.equal(reads, 1);
});

test("reconciliación de creación sólo afirma resultado único", () => {
  const input = { category: "SUPPLIES" as const, customCategory: null, description: "Servilletas", amount: 12.5 };
  assert.equal(reconcileCreatedExpense([], [expense()], input), "applied");
  assert.equal(reconcileCreatedExpense([], [], input), "unchanged");
  assert.equal(reconcileCreatedExpense([], [expense(), expense({ id: "expense-2" })], input), "ambiguous");
});

test("motivo de anulación es obligatorio y acotado", () => {
  assert.equal(validateVoidReason("  ").value, null);
  assert.deepEqual(validateVoidReason(" Duplicado "), { value: "Duplicado", error: null });
  assert.equal(validateVoidReason("x".repeat(301)).value, null);
});

test("sólo un gasto activo, autorizado y resuelto ofrece confirmación de anulación", () => {
  assert.equal(canOfferExpenseVoid(expense(), true, false), true);
  assert.equal(canOfferExpenseVoid(expense({ voided: true }), true, false), false);
  assert.equal(canOfferExpenseVoid(expense(), false, false), false);
  assert.equal(canOfferExpenseVoid(expense(), true, true), false);
});

test("reconciliación de anulación distingue aplicado, activo y desconocido", () => {
  assert.equal(reconcileVoidedExpense([expense({ voided: true })], "expense-1"), "applied");
  assert.equal(reconcileVoidedExpense([expense()], "expense-1"), "unchanged");
  assert.equal(reconcileVoidedExpense([], "expense-1"), "ambiguous");
});
