import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, mock, test } from "node:test";
import app from "../app";
import { getCapabilitiesForRole, type UserRole } from "../authorization/roles";
import { supabaseAdmin } from "../config/supabase";
import { mapRpcError } from "../database/rpc-errors";
import { AppError } from "../errors/app-error";
import { authService } from "../modules/auth/auth.service";
import type { AuthenticatedUser } from "../modules/auth/auth.types";
import { checkoutRepository, type CheckoutRepository } from "../modules/checkout/checkout.repository";
import { confirmPaymentSchema } from "../modules/checkout/checkout.schemas";
import { checkoutService, CheckoutService } from "../modules/checkout/checkout.service";
import type { CheckoutAggregate, PaymentMethod } from "../modules/checkout/checkout.types";
import { expensesRepository, type ExpensesRepository } from "../modules/expenses/expenses.repository";
import { recordExpenseSchema, type RecordExpenseInput } from "../modules/expenses/expenses.schemas";
import { expensesService, ExpensesService } from "../modules/expenses/expenses.service";
import type { ExpenseAggregate, ExpenseRow } from "../modules/expenses/expenses.types";

const actorId = "11111111-1111-4111-8111-111111111111";
const shiftId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const pointId = "44444444-4444-4444-8444-444444444444";
const expenseId = "55555555-5555-4555-8555-555555555555";
const itemId = "66666666-6666-4666-8666-666666666666";
const productId = "77777777-7777-4777-8777-777777777777";
const additionId = "88888888-8888-4888-8888-888888888888";

function actor(role: UserRole): AuthenticatedUser {
  return {
    id: actorId,
    fullName: "Operador de prueba",
    username: "operador.prueba",
    role,
    capabilities: getCapabilitiesForRole(role),
  };
}

function expenseRow(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: expenseId,
    shift_id: shiftId,
    recorded_by: actorId,
    recorded_by_role: "CASHIER",
    category: "SUPPLIES",
    custom_category: null,
    description: "Compra urgente",
    amount: 6.5,
    recorded_at: "2026-08-26T18:00:00.000Z",
    voided_at: null,
    voided_by: null,
    voided_by_role: null,
    void_reason: null,
    ...overrides,
  };
}

function expenseAggregate(overrides: Partial<ExpenseRow> = {}): ExpenseAggregate {
  const expense = expenseRow(overrides);
  return {
    expense,
    recordedBy: { id: actorId, full_name: "Caja Principal" },
    voidedBy: expense.voided_by ? { id: expense.voided_by, full_name: "Gerencia" } : null,
  };
}

function expenseRecordResult() {
  return {
    id: expenseId,
    shiftId,
    category: "SUPPLIES",
    customCategory: null,
    description: "Compra urgente",
    amount: 6.5,
    recordedAt: "2026-08-26T18:00:00.000Z",
    voided: false,
  };
}

function expenseVoidResult() {
  return {
    id: expenseId,
    shiftId,
    category: "SUPPLIES",
    customCategory: null,
    description: "Compra urgente",
    amount: 6.5,
    voided: true,
    voidedAt: "2026-08-26T18:30:00.000Z",
    voidReason: "Monto incorrecto",
  };
}

function fakeExpensesRepository(rows = [expenseAggregate()]): ExpensesRepository {
  return {
    async findCurrentShiftId() { return shiftId; },
    async listForShift() { return rows; },
    async findById(id) { return id === expenseId ? rows[0] ?? null : null; },
    async record() { return expenseRecordResult(); },
    async void() { return expenseVoidResult(); },
  };
}

function checkoutAggregate(status: "OPEN" | "AWAITING_PAYMENT" = "OPEN"): CheckoutAggregate {
  return {
    session: {
      id: sessionId,
      service_point_id: pointId,
      shift_id: shiftId,
      opened_by: actorId,
      opened_by_role: "WAITER",
      closed_by: null,
      closed_by_role: null,
      status,
      cancellation_reason: null,
      opened_at: "2026-08-26T17:00:00.000Z",
      closed_at: null,
    },
    servicePoint: { id: pointId, name: "Mesa 1", type: "TABLE" },
    items: [
      {
        item: {
          id: itemId,
          product_id: productId,
          product_name: "Hamburguesa snapshot",
          unit_price: 10.01,
          quantity: 2,
          status: "DELIVERED",
          line_number: 1,
          current_service_session_id: sessionId,
        },
        additions: [
          {
            id: additionId,
            order_item_id: itemId,
            product_id: additionId,
            addition_name: "Queso snapshot",
            unit_price: 0.99,
            quantity_per_item: 2,
          },
        ],
      },
      {
        item: {
          id: productId,
          product_id: additionId,
          product_name: "Item transferido",
          unit_price: 5.02,
          quantity: 1,
          status: "DELIVERED",
          line_number: 2,
          current_service_session_id: sessionId,
        },
        additions: [],
      },
      {
        item: {
          id: additionId,
          product_id: productId,
          product_name: "Cancelado",
          unit_price: 100,
          quantity: 1,
          status: "CANCELLED",
          line_number: 3,
          current_service_session_id: sessionId,
        },
        additions: [],
      },
    ],
  };
}

function paymentResult(method: PaymentMethod) {
  const businessAmount = 40;
  const feeRate = method === "CARD" ? 0.05 : 0;
  const feeAmount = method === "CARD" ? 2 : 0;
  return {
    paymentId: expenseId,
    serviceSessionId: sessionId,
    shiftId,
    method,
    businessAmount,
    feeRate,
    feeAmount,
    customerTotal: businessAmount + feeAmount,
    paidAt: "2026-08-26T19:00:00.000Z",
    sessionStatus: "PAID",
  };
}

function fakeCheckoutRepository(
  aggregate: CheckoutAggregate | null = checkoutAggregate()
): CheckoutRepository {
  return {
    async findPreview() { return aggregate; },
    async pay(_id, method) { return paymentResult(method); },
  };
}

afterEach(() => mock.restoreAll());

describe("objective 10 expense schemas and services", () => {
  test("validates SUPPLIES, CLEANING and complete OTHER inputs", () => {
    for (const input of [
      { category: "SUPPLIES", description: "Insumos", amount: 6.5 },
      { category: "CLEANING", description: "Limpieza", amount: 4 },
      { category: "OTHER", customCategory: "Movilidad", description: "Taxi", amount: 8.25 },
    ]) {
      assert.equal(recordExpenseSchema.safeParse(input).success, true);
    }
  });

  test("OTHER requires customCategory and standard categories reject it", () => {
    assert.equal(recordExpenseSchema.safeParse({ category: "OTHER", description: "Otro", amount: 1 }).success, false);
    assert.equal(recordExpenseSchema.safeParse({ category: "SUPPLIES", customCategory: "Otro", description: "Compra", amount: 1 }).success, false);
  });

  test("rejects zero, negative, excessive and over-precision amounts", () => {
    for (const amount of [0, -1, 100_000_000, 1.001]) {
      assert.equal(recordExpenseSchema.safeParse({ category: "SUPPLIES", description: "Compra", amount }).success, false);
    }
  });

  test("lists the current shift and excludes voided expenses from totals", async () => {
    const voided = expenseAggregate({
      id: additionId,
      amount: 50,
      voided_at: "2026-08-26T18:30:00.000Z",
      voided_by: actorId,
      voided_by_role: "MANAGER",
      void_reason: "Duplicado",
    });
    const result = await new ExpensesService(fakeExpensesRepository([expenseAggregate(), voided])).current();
    assert.equal(result.expenses.length, 2);
    assert.equal(result.activeExpensesCount, 1);
    assert.equal(result.activeExpensesTotal, 6.5);
    assert.equal(result.expenses[1]?.voided, true);
    assert.equal(result.expenses[1]?.voidedBy?.role, "MANAGER");
  });

  test("returns an empty snapshot when there is no open shift", async () => {
    const repository = fakeExpensesRepository();
    repository.findCurrentShiftId = async () => null;
    const result = await new ExpensesService(repository).current();
    assert.deepEqual(result, { shift: null, expenses: [], activeExpensesCount: 0, activeExpensesTotal: 0 });
  });

  test("records every category using the authenticated actor and RPC snapshot", async () => {
    const repository = fakeExpensesRepository();
    const seen: Array<{ input: RecordExpenseInput; actor: AuthenticatedUser }> = [];
    repository.record = async (input, currentActor) => {
      seen.push({ input, actor: currentActor });
      return {
        ...expenseRecordResult(),
        category: input.category,
        customCategory: input.customCategory ?? null,
        description: input.description,
        amount: input.amount,
      };
    };
    const service = new ExpensesService(repository);
    for (const input of [
      { category: "SUPPLIES" as const, description: "Queso", amount: 6.5 },
      { category: "CLEANING" as const, description: "Detergente", amount: 4 },
      { category: "OTHER" as const, customCategory: "Movilidad", description: "Taxi", amount: 8 },
    ]) {
      const result = await service.record(input, actor("CASHIER"));
      assert.equal(result.id, expenseId);
    }
    assert.equal(seen.length, 3);
    assert.equal(seen.every(({ actor: currentActor }) => currentActor.id === actorId), true);
  });

  test("voids without deleting and keeps the historical detail", async () => {
    const repository = fakeExpensesRepository([expenseAggregate()]);
    let reason = "";
    repository.void = async (_id, value) => { reason = value; return expenseVoidResult(); };
    const result = await new ExpensesService(repository).void(expenseId, "Monto incorrecto", actor("MANAGER"));
    assert.equal(reason, "Monto incorrecto");
    assert.equal(result.voided, true);
    assert.equal(result.voidReason, "Monto incorrecto");
  });

  test("maps missing expense detail to 404", async () => {
    await assert.rejects(
      new ExpensesService(fakeExpensesRepository()).get(additionId),
      (error: AppError) => error.statusCode === 404 && error.code === "SHIFT_EXPENSE_NOT_FOUND"
    );
  });
});

describe("objective 10 checkout preview and payment services", () => {
  test("allows preview for OPEN and AWAITING_PAYMENT sessions", async () => {
    for (const status of ["OPEN", "AWAITING_PAYMENT"] as const) {
      const result = await new CheckoutService(fakeCheckoutRepository(checkoutAggregate(status))).preview(sessionId);
      assert.equal(result.session.status, status);
    }
  });

  test("uses snapshots, additions, quantities and current ownership", async () => {
    const result = await new CheckoutService(fakeCheckoutRepository()).preview(sessionId);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0]?.productName, "Hamburguesa snapshot");
    assert.equal(result.items[0]?.additions[0]?.additionName, "Queso snapshot");
    assert.equal(result.items[0]?.lineTotal, 23.98);
    assert.equal(result.items[1]?.productName, "Item transferido");
    assert.equal(result.businessAmount, 29);
    assert.equal(result.items.some((item) => item.productName === "Cancelado"), false);
  });

  test("returns CASH and YAPE without fees and CARD with exactly 5%", async () => {
    const result = await new CheckoutService(fakeCheckoutRepository()).preview(sessionId);
    assert.deepEqual(result.paymentOptions.CASH, { method: "CASH", businessAmount: 29, feeRate: 0, feeAmount: 0, customerTotal: 29 });
    assert.deepEqual(result.paymentOptions.YAPE, { method: "YAPE", businessAmount: 29, feeRate: 0, feeAmount: 0, customerTotal: 29 });
    assert.deepEqual(result.paymentOptions.CARD, { method: "CARD", businessAmount: 29, feeRate: 0.05, feeAmount: 1.45, customerTotal: 30.45 });
  });

  test("rounds CARD fee to two decimals in integer cents", async () => {
    const aggregate = checkoutAggregate();
    aggregate.items = [{
      item: { ...aggregate.items[0]!.item, unit_price: 10.1, quantity: 1 },
      additions: [],
    }];
    const result = await new CheckoutService(fakeCheckoutRepository(aggregate)).preview(sessionId);
    assert.equal(result.paymentOptions.CARD.feeAmount, 0.51);
    assert.equal(result.paymentOptions.CARD.customerTotal, 10.61);
  });

  test("rejects preview for paid or cancelled sessions", async () => {
    const aggregate = checkoutAggregate();
    aggregate.session.status = "PAID";
    await assert.rejects(
      new CheckoutService(fakeCheckoutRepository(aggregate)).preview(sessionId),
      (error: AppError) => error.statusCode === 409 && error.code === "SERVICE_SESSION_NOT_ACTIVE"
    );
  });

  test("accepts CASH, YAPE and CARD results returned by the payment RPC", async () => {
    const service = new CheckoutService(fakeCheckoutRepository());
    for (const method of ["CASH", "YAPE", "CARD"] as const) {
      const result = await service.pay(sessionId, method, actor("CASHIER"));
      assert.equal(result.method, method);
      assert.equal(result.feeRate, method === "CARD" ? 0.05 : 0);
      assert.equal(result.customerTotal, method === "CARD" ? 42 : 40);
      assert.equal(result.sessionStatus, "PAID");
    }
  });

  test("frontend payment schema accepts only a method and rejects financial fields", () => {
    assert.equal(confirmPaymentSchema.safeParse({ method: "CASH" }).success, true);
    assert.equal(confirmPaymentSchema.safeParse({ method: "CARD", businessAmount: 1 }).success, false);
    assert.equal(confirmPaymentSchema.safeParse({ method: "TRANSFER" }).success, false);
  });
});

describe("objective 10 repository boundaries and RPC mapping", () => {
  test("expense mutations use exactly their RPCs and never delete rows", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    mock.method(supabaseAdmin, "rpc", async (name: string, args?: object) => {
      calls.push({ name, args: (args ?? {}) as Record<string, unknown> });
      return { data: { id: expenseId }, error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual table mutation was not expected"); });
    await expensesRepository.record({ category: "SUPPLIES", description: "Queso", amount: 6.5 }, actor("CASHIER"));
    await expensesRepository.void(expenseId, "Monto incorrecto", actor("MANAGER"));
    assert.deepEqual(calls.map(({ name }) => name), ["logistics_record_shift_expense", "logistics_void_shift_expense"]);
    assert.equal(calls[0]?.args.p_actor_id, actorId);
    assert.equal(calls[0]?.args.p_actor_role, "CASHIER");
    assert.equal(calls[1]?.args.p_reason, "Monto incorrecto");
  });

  test("payment invokes only logistics_pay_service_session with route and actor data", async () => {
    let calledName = "";
    let calledArgs: Record<string, unknown> = {};
    mock.method(supabaseAdmin, "rpc", async (name: string, args?: object) => {
      calledName = name;
      calledArgs = (args ?? {}) as Record<string, unknown>;
      return { data: paymentResult("CARD"), error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual financial write was not expected"); });
    await checkoutRepository.pay(sessionId, "CARD", actor("CASHIER"));
    assert.equal(calledName, "logistics_pay_service_session");
    assert.deepEqual(Object.keys(calledArgs).sort(), ["p_actor_id", "p_actor_role", "p_method", "p_service_session_id"]);
    assert.equal(calledArgs.p_service_session_id, sessionId);
    assert.equal(calledArgs.p_actor_id, actorId);
    assert.equal(calledArgs.p_method, "CARD");
    assert.equal("businessAmount" in calledArgs, false);
  });

  test("preview reads current-session items, excludes CANCELLED and performs no RPC/write", async () => {
    const operations: Array<{ table: string; method: string; args: unknown[] }> = [];
    function builder(table: string, result: { data: unknown; error: null }) {
      const value: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "order", "in"] as const) {
        value[method] = (...args: unknown[]) => {
          operations.push({ table, method, args });
          return value;
        };
      }
      value.maybeSingle = async () => result;
      value.then = (
        resolve: (result: { data: unknown; error: null }) => unknown,
        reject: (error: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject);
      return value;
    }
    const aggregate = checkoutAggregate();
    const session = aggregate.session;
    const point = aggregate.servicePoint;
    const item = aggregate.items[0]!.item;
    const addition = aggregate.items[0]!.additions[0]!;
    mock.method(supabaseAdmin, "from", (table: string) => {
      if (table === "service_sessions") return builder(table, { data: session, error: null });
      if (table === "service_points") return builder(table, { data: point, error: null });
      if (table === "order_items") return builder(table, { data: [item], error: null });
      if (table === "order_item_additions") return builder(table, { data: [addition], error: null });
      throw new Error(`unexpected table ${table}`);
    });
    mock.method(supabaseAdmin, "rpc", () => { throw new Error("preview must not invoke RPCs"); });
    const result = await checkoutRepository.findPreview(sessionId);
    assert.equal(result?.items.length, 1);
    assert.equal(operations.some(({ table, method, args }) => table === "order_items" && method === "eq" && args[0] === "current_service_session_id" && args[1] === sessionId), true);
    assert.equal(operations.some(({ table, method, args }) => table === "order_items" && method === "neq" && args[0] === "status" && args[1] === "CANCELLED"), true);
    assert.equal(operations.some(({ method }) => ["insert", "update", "delete"].includes(method)), false);
  });

  test("maps payment and expense domain errors without raw SQL messages", () => {
    const cases: Array<[string, number]> = [
      ["PAYMENT_ALREADY_EXISTS", 409],
      ["SERVICE_SESSION_NOT_AWAITING_PAYMENT", 409],
      ["SHIFT_NOT_OPEN", 409],
      ["ORDER_ITEMS_NOT_DELIVERED", 409],
      ["NOTHING_TO_PAY", 409],
      ["PAYMENT_AMOUNT_INVALID", 409],
      ["SERVICE_SESSION_CHANGED", 409],
      ["SERVICE_SESSION_NOT_FOUND", 404],
      ["SHIFT_EXPENSE_NOT_FOUND", 404],
      ["SHIFT_EXPENSE_ALREADY_VOIDED", 409],
      ["EXPENSE_SHIFT_CLOSED", 409],
    ];
    for (const [code, status] of cases) {
      const error = mapRpcError({ code: "P0001", message: code }, "FAILED");
      assert.equal(error.code, code);
      assert.equal(error.statusCode, status);
      assert.equal(error.message.includes("PostgREST"), false);
    }
  });
});

let server: Server;
let baseUrl: string;
const headers = { authorization: "Bearer test", "content-type": "application/json" };

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function authenticateAs(role: UserRole) {
  mock.method(authService, "getCurrentUser", async () => actor(role));
}

describe("objective 10 routes and capabilities", () => {
  test("CASHIER can list, record and void expenses", async () => {
    authenticateAs("CASHIER");
    mock.method(expensesService, "current", async () => ({ shift: { id: shiftId }, expenses: [], activeExpensesCount: 0, activeExpensesTotal: 0 }));
    mock.method(expensesService, "get", async () => ({ id: expenseId }));
    mock.method(expensesService, "record", async () => ({ id: expenseId }));
    mock.method(expensesService, "void", async () => ({ id: expenseId, voided: true }));
    const list = await fetch(`${baseUrl}/api/logistics/expenses/current`, { headers });
    const detail = await fetch(`${baseUrl}/api/logistics/expenses/${expenseId}`, { headers });
    const record = await fetch(`${baseUrl}/api/logistics/expenses`, { method: "POST", headers, body: JSON.stringify({ category: "SUPPLIES", description: "Queso", amount: 6.5 }) });
    const voided = await fetch(`${baseUrl}/api/logistics/expenses/${expenseId}/void`, { method: "POST", headers, body: JSON.stringify({ reason: "Monto incorrecto" }) });
    assert.equal(list.status, 200);
    assert.equal(detail.status, 200);
    assert.equal(record.status, 201);
    assert.equal(voided.status, 200);
  });

  test("WAITER and KITCHEN cannot view or manage expenses", async () => {
    for (const role of ["WAITER", "KITCHEN"] as const) {
      authenticateAs(role);
      const list = await fetch(`${baseUrl}/api/logistics/expenses/current`, { headers });
      const record = await fetch(`${baseUrl}/api/logistics/expenses`, { method: "POST", headers, body: JSON.stringify({ category: "SUPPLIES", description: "Queso", amount: 1 }) });
      assert.equal(list.status, 403);
      assert.equal(record.status, 403);
      mock.restoreAll();
    }
  });

  test("expense route validation rejects category and amount inconsistencies", async () => {
    authenticateAs("MANAGER");
    for (const body of [
      { category: "OTHER", description: "Otro", amount: 1 },
      { category: "CLEANING", customCategory: "Otra", description: "Limpieza", amount: 1 },
      { category: "SUPPLIES", description: "Compra", amount: 0 },
    ]) {
      const response = await fetch(`${baseUrl}/api/logistics/expenses`, { method: "POST", headers, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
  });

  test("WAITER can preview checkout but cannot confirm payment", async () => {
    authenticateAs("WAITER");
    mock.method(checkoutService, "preview", async () => ({ session: { id: sessionId, status: "OPEN" }, items: [], businessAmount: 0, paymentOptions: {} }));
    const preview = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/checkout`, { headers });
    const payment = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/payments`, { method: "POST", headers, body: JSON.stringify({ method: "CASH" }) });
    assert.equal(preview.status, 200);
    assert.equal(payment.status, 403);
  });

  test("CASHIER confirms payment with route method and authenticated actor", async () => {
    authenticateAs("CASHIER");
    mock.method(checkoutService, "pay", async (id: string, method: PaymentMethod, currentActor: AuthenticatedUser) => {
      assert.equal(id, sessionId);
      assert.equal(method, "CARD");
      assert.equal(currentActor.id, actorId);
      return paymentResult(method);
    });
    const response = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/payments`, { method: "POST", headers, body: JSON.stringify({ method: "CARD" }) });
    assert.equal(response.status, 201);
  });

  test("KITCHEN cannot charge and invalid payment fields are rejected", async () => {
    authenticateAs("KITCHEN");
    const preview = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/checkout`, { headers });
    const forbidden = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/payments`, { method: "POST", headers, body: JSON.stringify({ method: "CASH" }) });
    assert.equal(preview.status, 403);
    assert.equal(forbidden.status, 403);
    mock.restoreAll();
    authenticateAs("MANAGER");
    const invalid = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/payments`, { method: "POST", headers, body: JSON.stringify({ method: "CASH", businessAmount: 1 }) });
    assert.equal(invalid.status, 400);
  });

  test("capability matrix grants financial operations only to approved roles", () => {
    for (const role of ["ADMIN", "MANAGER", "CASHIER"] as const) {
      const capabilities = getCapabilitiesForRole(role);
      assert.equal(capabilities.includes("expenses.view"), true);
      assert.equal(capabilities.includes("expenses.manage"), true);
      assert.equal(capabilities.includes("payments.charge"), true);
    }
    for (const role of ["WAITER", "KITCHEN"] as const) {
      const capabilities = getCapabilitiesForRole(role);
      assert.equal(capabilities.includes("expenses.view"), false);
      assert.equal(capabilities.includes("expenses.manage"), false);
      assert.equal(capabilities.includes("payments.charge"), false);
    }
  });
});
