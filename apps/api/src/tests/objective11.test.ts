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
import { historyRepository, type HistoryRepository } from "../modules/history/history.repository";
import {
  historyPaginationSchema,
  type HistoryPagination,
} from "../modules/history/history.schemas";
import { historyService, HistoryService } from "../modules/history/history.service";
import type { HistoryDetailData, HistoryShiftRow } from "../modules/history/history.types";
import { serviceSessionsRepository } from "../modules/service-points/service-points.repository";
import { releaseServiceSessionSchema } from "../modules/service-points/service-points.schemas";
import { servicePointsService } from "../modules/service-points/service-points.service";
import {
  shiftsRepository,
  type Shift,
  type ShiftOperationsRepository,
  type ShiftsRepository,
} from "../modules/shifts/shifts.repository";
import {
  closeShiftSchema,
  reconcileShiftSchema,
  type ReconcileShiftBody,
} from "../modules/shifts/shifts.schemas";
import { shiftsService, ShiftsService } from "../modules/shifts/shifts.service";

const actorId = "11111111-1111-4111-8111-111111111111";
const managerId = "22222222-2222-4222-8222-222222222222";
const shiftId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";
const itemId = "66666666-6666-4666-8666-666666666666";
const pointId = "77777777-7777-4777-8777-777777777777";
const otherSessionId = "88888888-8888-4888-8888-888888888888";
const recordId = "99999999-9999-4999-8999-999999999999";

function actor(role: UserRole): AuthenticatedUser {
  return {
    id: actorId,
    fullName: "Operador actual",
    username: "operador.actual",
    role,
    capabilities: getCapabilitiesForRole(role),
  };
}

function shiftRow(overrides: Partial<Shift> = {}): Shift {
  return {
    id: shiftId,
    status: "CLOSED",
    opening_cash: 100,
    opened_at: "2026-08-27T08:00:00.000Z",
    closed_at: "2026-08-27T16:00:00.000Z",
    opened_by: managerId,
    opened_by_role: "MANAGER",
    closed_by: actorId,
    closed_by_role: "CASHIER",
    ...overrides,
  };
}

function releaseResult() {
  return {
    serviceSessionId: sessionId,
    shiftId,
    sessionStatus: "CANCELLED",
    reason: "Mesa abierta por error",
    businessAmount: 0,
    releasedAt: "2026-08-27T10:00:00.000Z",
    releasedBy: actorId,
    releasedByRole: "CASHIER",
  };
}

function closeResult() {
  return {
    closureId: recordId,
    shiftId,
    shiftStatus: "CLOSED",
    closedAt: "2026-08-27T16:00:00.000Z",
    closedBy: actorId,
    closedByRole: "CASHIER",
    openingCash: 100,
    businessSalesTotal: 500,
    cashTotal: 200,
    yapeTotal: 150,
    cardTotal: 150,
    cardFeeTotal: 7.5,
    customerCardTotal: 157.5,
    operationalExpensesCount: 1,
    operationalExpensesTotal: 20,
    expectedCashAtClose: 280,
    serviceSessionsCount: 4,
    cancelledSessionsCount: 1,
    ordersCount: 3,
    orderItemsCount: 5,
    productUnitsCount: 7,
    cancelledOrderItemsCount: 1,
    cancelledPendingCount: 1,
    cancelledPreparingCount: 0,
    cancelledReadyCount: 0,
    cancelledDeliveredCount: 0,
    serviceSessionTransfersCount: 1,
    orderItemTransfersCount: 1,
    closingNotes: "Turno sin incidencias",
    summary: { reportVersion: 1, releasedSessionsCount: 1 },
  };
}

function reconciliationResult() {
  return {
    reconciliationId: recordId,
    shiftId,
    reconciledAt: "2026-08-27T16:10:00.000Z",
    reconciledBy: actorId,
    reconciledByRole: "MANAGER",
    openingCashSnapshot: 100,
    cashSalesExpected: 200,
    cashExpensesSnapshot: 20,
    expectedCash: 280,
    countedCash: 280,
    cashDifference: 0,
    expectedYape: 150,
    confirmedYape: 150,
    yapeDifference: 0,
    expectedCardBusiness: 150,
    expectedCardFee: 7.5,
    expectedCardCustomerTotal: 157.5,
    confirmedCardCustomerTotal: 157.5,
    cardDifference: 0,
    notes: "Todo correcto",
  };
}

function closureRow() {
  return {
    id: recordId, shift_id: shiftId, closed_by: actorId, closed_by_role: "CASHIER" as const,
    business_sales_total: 500, cash_total: 200, yape_total: 150, card_total: 150,
    card_fee_total: 7.5, customer_card_total: 157.5, service_sessions_count: 4,
    cancelled_sessions_count: 1, orders_count: 3,
    summary: { reportVersion: 1, releasedSessionsCount: 1 }, order_items_count: 5,
    product_units_count: 7, cancelled_order_items_count: 1, cancelled_pending_count: 1,
    cancelled_preparing_count: 0, cancelled_ready_count: 0, cancelled_delivered_count: 0,
    service_session_transfers_count: 1, order_item_transfers_count: 1,
    closing_notes: "Turno sin incidencias", operational_expenses_count: 1,
    operational_expenses_total: 20, report_path: null,
    created_at: "2026-08-27T16:00:00.000Z",
  };
}

function reconciliationRow() {
  return {
    id: recordId, shift_id: shiftId, reconciled_by: actorId,
    reconciled_by_role: "MANAGER" as const, opening_cash_snapshot: 100,
    cash_sales_expected: 200, cash_expenses_snapshot: 20, expected_cash: 280,
    counted_cash: 280, cash_difference: 0, expected_yape: 150, confirmed_yape: 150,
    yape_difference: 0, expected_card_business: 150, expected_card_fee: 7.5,
    expected_card_customer_total: 157.5, confirmed_card_customer_total: 157.5,
    card_difference: 0, notes: "Todo correcto",
    created_at: "2026-08-27T16:10:00.000Z", updated_at: "2026-08-27T16:10:00.000Z",
  };
}

function historyDetail(): HistoryDetailData {
  return {
    shift: shiftRow(),
    closure: closureRow(),
    reconciliation: reconciliationRow(),
    sessions: [{
      id: sessionId, service_point_id: pointId, shift_id: shiftId,
      opened_by: managerId, opened_by_role: "WAITER", closed_by: actorId,
      closed_by_role: "CASHIER", status: "PAID", cancellation_reason: null,
      opened_at: "2026-08-27T09:00:00.000Z", closed_at: "2026-08-27T10:00:00.000Z",
    }],
    orders: [{
      id: orderId, service_session_id: sessionId, sequence_number: 1, notes: null,
      sent_at: "2026-08-27T09:10:00.000Z", created_by: managerId,
      created_by_role: "WAITER", created_at: "2026-08-27T09:10:00.000Z",
    }],
    items: [{
      id: itemId, order_id: orderId, current_service_session_id: otherSessionId,
      line_number: 1, product_id: recordId, product_name: "Hamburguesa snapshot",
      unit_price: 40, quantity: 1, notes: "Sin cebolla", preparation_station: "KITCHEN",
      status: "DELIVERED", preparing_at: "2026-08-27T09:11:00.000Z",
      ready_at: "2026-08-27T09:15:00.000Z", delivered_at: "2026-08-27T09:16:00.000Z",
      cancelled_by: null, cancelled_by_role: null, cancelled_at: null,
      cancellation_reason: null, cancelled_from_status: null,
      created_at: "2026-08-27T09:10:00.000Z", updated_at: "2026-08-27T09:16:00.000Z",
    }],
    additions: [{
      id: recordId, order_item_id: itemId, product_id: pointId,
      addition_name: "Huevo snapshot", unit_price: 2, quantity_per_item: 1,
      created_at: "2026-08-27T09:10:00.000Z",
    }],
    payments: [{
      id: recordId, service_session_id: sessionId, shift_id: shiftId,
      received_by: actorId, received_by_role: "CASHIER", method: "CARD",
      business_amount: 40, fee_rate: 0.05, fee_amount: 2, customer_total: 42,
      paid_at: "2026-08-27T10:00:00.000Z",
    }],
    expenses: [{
      id: recordId, shift_id: shiftId, recorded_by: actorId, recorded_by_role: "CASHIER",
      category: "SUPPLIES", custom_category: null, description: "Compra",
      amount: 20, recorded_at: "2026-08-27T12:00:00.000Z",
      voided_at: "2026-08-27T12:10:00.000Z", voided_by: managerId,
      voided_by_role: "MANAGER", void_reason: "Duplicado",
    }],
    sessionTransfers: [{
      id: recordId, service_session_id: sessionId, from_service_point_id: pointId,
      from_service_point_name: "Mesa 1 snapshot", to_service_point_id: recordId,
      to_service_point_name: "Mesa 2 snapshot", transferred_by: managerId,
      transferred_by_role: "WAITER", reason: "Cliente", transferred_at: "2026-08-27T09:20:00.000Z",
    }],
    itemTransfers: [{
      id: recordId, order_item_id: itemId, from_service_session_id: sessionId,
      to_service_session_id: otherSessionId, from_service_point_id: pointId,
      from_service_point_name: "Mesa 1 snapshot", to_service_point_id: recordId,
      to_service_point_name: "Mesa 2 snapshot", quantity: 1, status_at_transfer: "DELIVERED",
      transferred_by: managerId, transferred_by_role: "WAITER", reason: null,
      transferred_at: "2026-08-27T09:20:00.000Z",
    }],
    audit: [{
      id: recordId, user_id: actorId, actor_role: "CASHIER", action: "SHIFT_CLOSED",
      entity: "SHIFT", entity_id: shiftId, shift_id: shiftId, service_session_id: null,
      details: { businessSalesTotal: 500 }, created_at: "2026-08-27T16:00:00.000Z",
    }],
    points: [{ id: pointId, name: "Mesa renombrada actual", type: "TABLE" }],
    profiles: [
      { id: actorId, full_name: "Cajero actual" },
      { id: managerId, full_name: "Mesero actual" },
    ],
  };
}

function fakeHistoryRepository(detail = historyDetail()): HistoryRepository {
  return {
    async listClosed() {
      return {
        shifts: [detail.shift], closures: [detail.closure!],
        reconciledShiftIds: [shiftId], profiles: detail.profiles, total: 1,
      };
    },
    async findClosedDetail(id) { return id === shiftId ? detail : null; },
  };
}

afterEach(() => mock.restoreAll());

describe("objective 11 schemas and capabilities", () => {
  test("grants tables.release to ADMIN, MANAGER, WAITER and CASHIER only", () => {
    for (const role of ["ADMIN", "MANAGER", "WAITER", "CASHIER"] as const) {
      assert.equal(getCapabilitiesForRole(role).includes("tables.release"), true);
    }
    assert.equal(getCapabilitiesForRole("KITCHEN").includes("tables.release"), false);
  });

  test("keeps close, reconcile and history capabilities separated", () => {
    assert.equal(getCapabilitiesForRole("CASHIER").includes("shift.close"), true);
    assert.equal(getCapabilitiesForRole("WAITER").includes("shift.close"), false);
    assert.equal(getCapabilitiesForRole("CASHIER").includes("cash.reconcile"), false);
    assert.equal(getCapabilitiesForRole("CASHIER").includes("history.view"), false);
    assert.equal(getCapabilitiesForRole("MANAGER").includes("cash.reconcile"), true);
    assert.equal(getCapabilitiesForRole("MANAGER").includes("history.view"), true);
  });

  test("release requires one trimmed non-empty reason", () => {
    assert.deepEqual(releaseServiceSessionSchema.parse({ reason: "  Error  " }), { reason: "Error" });
    assert.equal(releaseServiceSessionSchema.safeParse({}).success, false);
    assert.equal(releaseServiceSessionSchema.safeParse({ reason: "   " }).success, false);
    assert.equal(releaseServiceSessionSchema.safeParse({ reason: "Error", payment: 0 }).success, false);
  });

  test("closing notes are optional but cannot be blank", () => {
    assert.equal(closeShiftSchema.safeParse({}).success, true);
    assert.deepEqual(closeShiftSchema.parse({ closingNotes: "  Bien  " }), { closingNotes: "Bien" });
    assert.equal(closeShiftSchema.safeParse({ closingNotes: "  " }).success, false);
  });

  test("reconciliation accepts only three observed amounts and optional notes", () => {
    const valid = { countedCash: 280.5, confirmedYape: 150, confirmedCardCustomerTotal: 157.5 };
    assert.equal(reconcileShiftSchema.safeParse(valid).success, true);
    assert.equal(reconcileShiftSchema.safeParse({ ...valid, countedCash: -1 }).success, false);
    assert.equal(reconcileShiftSchema.safeParse({ ...valid, confirmedYape: 1.001 }).success, false);
    assert.equal(reconcileShiftSchema.safeParse({ ...valid, expectedCash: 280 }).success, false);
    assert.equal(reconcileShiftSchema.safeParse({ ...valid, actorId }).success, false);
  });

  test("history pagination defaults safely and enforces bounds", () => {
    assert.deepEqual(historyPaginationSchema.parse({}), { page: 1, pageSize: 20 });
    assert.deepEqual(historyPaginationSchema.parse({ page: "2", pageSize: "100" }), { page: 2, pageSize: 100 });
    assert.equal(historyPaginationSchema.safeParse({ page: 0 }).success, false);
    assert.equal(historyPaginationSchema.safeParse({ pageSize: 101 }).success, false);
  });
});

describe("objective 11 exact RPC boundaries", () => {
  test("release invokes only logistics_release_empty_service_session with route and actor data", async () => {
    let call: { name: string; args?: object } | null = null;
    mock.method(supabaseAdmin, "rpc", async (name: string, args?: object) => {
      call = { name, args };
      return { data: releaseResult(), error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual table access was not expected"); });
    await serviceSessionsRepository.release(sessionId, "Mesa abierta por error", actor("CASHIER"));
    assert.deepEqual(call, {
      name: "logistics_release_empty_service_session",
      args: {
        p_actor_id: actorId, p_actor_role: "CASHIER",
        p_reason: "Mesa abierta por error", p_service_session_id: sessionId,
      },
    });
  });

  test("close invokes only logistics_close_shift and sends null notes", async () => {
    let call: { name: string; args?: object } | null = null;
    mock.method(supabaseAdmin, "rpc", async (name: string, args?: object) => {
      call = { name, args };
      return { data: closeResult(), error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual closure write was not expected"); });
    await shiftsRepository.close(shiftId, null, actor("CASHIER"));
    assert.deepEqual(call, {
      name: "logistics_close_shift",
      args: { p_actor_id: actorId, p_actor_role: "CASHIER", p_closing_notes: null, p_shift_id: shiftId },
    });
  });

  test("reconciliation invokes only logistics_reconcile_shift without expected fields", async () => {
    let call: { name: string; args?: object } | null = null;
    mock.method(supabaseAdmin, "rpc", async (name: string, args?: object) => {
      call = { name, args };
      return { data: reconciliationResult(), error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual reconciliation write was not expected"); });
    const input: ReconcileShiftBody = {
      countedCash: 280, confirmedYape: 150, confirmedCardCustomerTotal: 157.5,
    };
    await shiftsRepository.reconcile(shiftId, input, actor("MANAGER"));
    assert.deepEqual(call, {
      name: "logistics_reconcile_shift",
      args: {
        p_actor_id: actorId, p_actor_role: "MANAGER",
        p_confirmed_card_customer_total: 157.5, p_confirmed_yape: 150,
        p_counted_cash: 280, p_notes: null, p_shift_id: shiftId,
      },
    });
    assert.equal(JSON.stringify(call).includes("expectedCash"), false);
  });
});

describe("objective 11 services and normalized history", () => {
  test("release validates and preserves the RPC snapshot", async () => {
    mock.method(serviceSessionsRepository, "release", async () => releaseResult());
    const result = await servicePointsService.release(
      sessionId,
      "Mesa abierta por error",
      actor("CASHIER")
    );
    assert.equal(result.sessionStatus, "CANCELLED");
    assert.equal(result.businessAmount, 0);
  });

  test("close and reconciliation preserve typed RPC snapshots", async () => {
    const base: ShiftsRepository = {
      async findCurrent() { return null; }, async findById() { return shiftRow(); },
      async create() { return shiftRow(); },
    };
    const operations: ShiftOperationsRepository = {
      async findById() { return shiftRow(); }, async findClosure() { return closureRow(); },
      async findReconciliation() { return reconciliationRow(); },
      async close() { return closeResult(); }, async reconcile() { return reconciliationResult(); },
    };
    const service = new ShiftsService(base, operations);
    const closed = await service.close(shiftId, "Turno sin incidencias", actor("CASHIER"));
    const reconciled = await service.reconcile(
      shiftId,
      { countedCash: 280, confirmedYape: 150, confirmedCardCustomerTotal: 157.5 },
      actor("MANAGER")
    );
    assert.equal(closed.businessSalesTotal, 500);
    assert.equal(closed.expectedCashAtClose, 280);
    assert.equal(reconciled.expectedCardCustomerTotal, 157.5);
    assert.equal(reconciled.cardDifference, 0);
  });

  test("closure and reconciliation reads use stored snapshots", async () => {
    const base: ShiftsRepository = {
      async findCurrent() { return null; }, async findById() { return shiftRow(); },
      async create() { return shiftRow(); },
    };
    const operations: ShiftOperationsRepository = {
      async findById() { return shiftRow(); }, async findClosure() { return closureRow(); },
      async findReconciliation() { return reconciliationRow(); },
      async close() { return closeResult(); }, async reconcile() { return reconciliationResult(); },
    };
    const service = new ShiftsService(base, operations);
    const closure = await service.getClosure(shiftId);
    const reconciliation = await service.getReconciliation(shiftId);
    assert.equal(closure.closure.cardFeeTotal, 7.5);
    assert.equal(closure.expectedCashAtClose, 280);
    assert.equal(reconciliation.cashDifference, 0);
  });

  test("history list is summarized and paginated", async () => {
    const result = await new HistoryService(fakeHistoryRepository()).list({ page: 1, pageSize: 20 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.businessSalesTotal, 500);
    assert.equal(result.items[0]?.reconciliationExists, true);
    assert.equal("orders" in (result.items[0] ?? {}), false);
    assert.deepEqual(result.pagination, { page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });

  test("history detail preserves origin, economic owner, additions, fees and voided expenses", async () => {
    const result = await new HistoryService(fakeHistoryRepository()).detail(shiftId);
    const item = result.orders[0]?.items[0];
    assert.equal(result.orders[0]?.originalServiceSessionId, sessionId);
    assert.equal(item?.currentServiceSessionId, otherSessionId);
    assert.equal(item?.productName, "Hamburguesa snapshot");
    assert.equal(item?.additions[0]?.additionName, "Huevo snapshot");
    assert.equal(result.payments[0]?.businessAmount, 40);
    assert.equal(result.payments[0]?.feeAmount, 2);
    assert.equal(result.payments[0]?.customerTotal, 42);
    assert.equal(result.expenses[0]?.voidedAt !== null, true);
    assert.equal(result.expenses[0]?.voidReason, "Duplicado");
  });

  test("history marks current names and transfer snapshots honestly", async () => {
    const result = await new HistoryService(fakeHistoryRepository()).detail(shiftId);
    assert.equal(result.shift.openedBy?.fullNameSource, "CURRENT_PROFILE");
    assert.equal(result.serviceSessions[0]?.servicePoint.nameSource, "CURRENT_SERVICE_POINT");
    assert.equal(result.transfers.serviceSessions[0]?.fromServicePoint.nameSource, "TRANSFER_SNAPSHOT");
    assert.equal(result.transfers.orderItems[0]?.toServicePoint.name, "Mesa 2 snapshot");
  });

  test("missing closed history is a safe 404", async () => {
    await assert.rejects(
      new HistoryService(fakeHistoryRepository()).detail(recordId),
      (error: AppError) => error.statusCode === 404 && error.code === "SHIFT_HISTORY_NOT_FOUND"
    );
  });
});

describe("objective 11 history repository query shape", () => {
  test("detail uses one bulk query per table even with many items", async () => {
    const detail = historyDetail();
    detail.items = Array.from({ length: 50 }, (_, index) => ({
      ...detail.items[0]!, id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
    }));
    detail.additions = detail.items.map((item) => ({ ...detail.additions[0]!, order_item_id: item.id }));
    const results: Record<string, unknown> = {
      shifts: detail.shift, shift_closures: detail.closure,
      cash_reconciliations: detail.reconciliation, service_sessions: detail.sessions,
      payments: detail.payments, shift_expenses: detail.expenses, audit_logs: detail.audit,
      orders: detail.orders, service_session_transfers: detail.sessionTransfers,
      order_item_transfers: detail.itemTransfers, order_items: detail.items,
      order_item_additions: detail.additions, profiles: detail.profiles, service_points: detail.points,
    };
    const calls: string[] = [];
    mock.method(supabaseAdmin, "from", ((table: string) => {
      calls.push(table);
      const response = { data: results[table] ?? [], error: null, count: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "range"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => response;
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return chain;
    }) as never);

    const result = await historyRepository.findClosedDetail(shiftId);
    assert.equal(result?.items.length, 50);
    assert.equal(calls.length, 14);
    for (const table of new Set(calls)) {
      assert.equal(calls.filter((value) => value === table).length, 1);
    }
  });

  test("list filters CLOSED, orders descending and applies the requested range", async () => {
    const operations: Array<[string, unknown[]]> = [];
    const tableResults: Record<string, unknown> = {
      shifts: [shiftRow()], shift_closures: [closureRow()],
      cash_reconciliations: [{ shift_id: shiftId }],
      profiles: [{ id: actorId, full_name: "Cajero actual" }],
    };
    mock.method(supabaseAdmin, "from", ((table: string) => {
      const response = { data: tableResults[table] ?? [], error: null, count: table === "shifts" ? 21 : null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "range"]) {
        chain[method] = (...args: unknown[]) => { operations.push([method, args]); return chain; };
      }
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return chain;
    }) as never);
    const result = await historyRepository.listClosed({ page: 2, pageSize: 20 });
    assert.equal(result.total, 21);
    assert.equal(operations.some(([name, args]) => name === "eq" && args[0] === "status" && args[1] === "CLOSED"), true);
    assert.equal(operations.some(([name, args]) => name === "order" && args[0] === "closed_at" && (args[1] as { ascending: boolean }).ascending === false), true);
    assert.equal(operations.some(([name, args]) => name === "range" && args[0] === 20 && args[1] === 39), true);
  });
});

describe("objective 11 RPC error mapping", () => {
  test("maps input, missing and conflict codes without leaking raw database text", () => {
    const cases: Array<[string, number]> = [
      ["SERVICE_SESSION_RELEASE_REASON_REQUIRED", 400], ["SHIFT_NOT_FOUND", 404],
      ["SHIFT_CLOSURE_NOT_FOUND", 404], ["RECONCILIATION_INPUT_INVALID", 400],
      ["SHIFT_HAS_ACTIVE_SESSIONS", 409], ["SHIFT_HAS_UNRESOLVED_ITEMS", 409],
      ["SHIFT_PAYMENT_INCONSISTENT", 409], ["SHIFT_EXPECTED_CASH_NEGATIVE", 409],
      ["CASH_RECONCILIATION_ALREADY_EXISTS", 409],
    ];
    for (const [code, status] of cases) {
      const error = mapRpcError({ code: "P0001", message: code }, "FAILED");
      assert.equal(error.code, code);
      assert.equal(error.statusCode, status);
      assert.equal(error.message.includes("raw SQL"), false);

      const decorated = mapRpcError({ code: "P0001", message: `${code}: raw SQL secret` }, "FAILED");
      assert.equal(decorated.code, "FAILED");
      assert.equal(decorated.statusCode, 500);
      assert.equal(decorated.message.includes("raw SQL"), false);
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
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
});

function authenticateAs(getRole: () => UserRole) {
  mock.method(authService, "getCurrentUser", async () => actor(getRole()));
}

describe("objective 11 routes and capabilities", () => {
  test("release allows ADMIN, MANAGER, WAITER and CASHIER while KITCHEN gets 403", async () => {
    let role: UserRole = "ADMIN";
    authenticateAs(() => role);
    mock.method(servicePointsService, "release", async (
      _id: string,
      reason: string,
      current: AuthenticatedUser
    ) => ({
      ...releaseResult(), reason, releasedByRole: current.role,
    }));
    for (role of ["ADMIN", "MANAGER", "WAITER", "CASHIER"] as const) {
      const response = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/release`, {
        method: "POST", headers, body: JSON.stringify({ reason: "Mesa abierta por error" }),
      });
      assert.equal(response.status, 200);
    }
    role = "KITCHEN";
    const denied = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/release`, {
      method: "POST", headers, body: JSON.stringify({ reason: "Error" }),
    });
    assert.equal(denied.status, 403);
  });

  test("release rejects a missing reason before reaching the service", async () => {
    authenticateAs(() => "WAITER");
    let called = false;
    mock.method(servicePointsService, "release", async () => { called = true; return releaseResult(); });
    const response = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/release`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  });

  test("close allows ADMIN, MANAGER and CASHIER while WAITER and KITCHEN get 403", async () => {
    let role: UserRole = "ADMIN";
    authenticateAs(() => role);
    mock.method(shiftsService, "close", async () => closeResult());
    for (role of ["ADMIN", "MANAGER", "CASHIER"] as const) {
      const response = await fetch(`${baseUrl}/api/logistics/shifts/${shiftId}/close`, {
        method: "POST", headers, body: JSON.stringify({}),
      });
      assert.equal(response.status, 201);
    }
    for (role of ["WAITER", "KITCHEN"] as const) {
      const response = await fetch(`${baseUrl}/api/logistics/shifts/${shiftId}/close`, {
        method: "POST", headers, body: JSON.stringify({}),
      });
      assert.equal(response.status, 403);
    }
  });

  test("CASHIER can read closure but not reconciliation", async () => {
    authenticateAs(() => "CASHIER");
    mock.method(shiftsService, "getClosure", async () => ({
      shift: shiftRow(), closure: closureRow(), expectedCashAtClose: 280,
    }));
    const closure = await fetch(`${baseUrl}/api/logistics/shifts/${shiftId}/closure`, { headers });
    const reconciliation = await fetch(`${baseUrl}/api/logistics/shifts/${shiftId}/reconciliation`, { headers });
    assert.equal(closure.status, 200);
    assert.equal(reconciliation.status, 403);
  });

  test("reconciliation allows ADMIN and MANAGER and rejects expected client fields", async () => {
    let role: UserRole = "ADMIN";
    authenticateAs(() => role);
    mock.method(shiftsService, "reconcile", async () => reconciliationResult());
    const valid = { countedCash: 280, confirmedYape: 150, confirmedCardCustomerTotal: 157.5 };
    for (role of ["ADMIN", "MANAGER"] as const) {
      const response = await fetch(`${baseUrl}/api/logistics/shifts/${shiftId}/reconciliation`, {
        method: "POST", headers, body: JSON.stringify(valid),
      });
      assert.equal(response.status, 201);
    }
    const invalid = await fetch(`${baseUrl}/api/logistics/shifts/${shiftId}/reconciliation`, {
      method: "POST", headers, body: JSON.stringify({ ...valid, expectedCash: 280 }),
    });
    assert.equal(invalid.status, 400);
  });

  test("history allows ADMIN and MANAGER only and forwards pagination", async () => {
    let role: UserRole = "ADMIN";
    authenticateAs(() => role);
    mock.method(historyService, "list", async (pagination: HistoryPagination) => {
      assert.deepEqual(pagination, { page: 2, pageSize: 10 });
      return { items: [], pagination: { ...pagination, total: 0, totalPages: 0 } };
    });
    for (role of ["ADMIN", "MANAGER"] as const) {
      const response = await fetch(`${baseUrl}/api/logistics/history/shifts?page=2&pageSize=10`, { headers });
      assert.equal(response.status, 200);
    }
    role = "CASHIER";
    const denied = await fetch(`${baseUrl}/api/logistics/history/shifts`, { headers });
    assert.equal(denied.status, 403);
  });

  test("history detail route returns the normalized service result", async () => {
    authenticateAs(() => "MANAGER");
    mock.method(historyService, "detail", async () => ({ marker: "normalized-detail" }));
    const response = await fetch(`${baseUrl}/api/logistics/history/shifts/${shiftId}`, { headers });
    const body = await response.json() as { history?: { marker?: string } };
    assert.equal(response.status, 200);
    assert.equal(body.history?.marker, "normalized-detail");
  });
});
