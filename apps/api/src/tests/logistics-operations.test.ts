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
import { logisticsCatalogRepository } from "../modules/logistics-catalog/logistics-catalog.repository";
import { logisticsCatalogService } from "../modules/logistics-catalog/logistics-catalog.service";
import { ordersRepository, type OrdersRepository } from "../modules/orders/orders.repository";
import { createOrderSchema, type CreateOrderInput } from "../modules/orders/orders.schemas";
import { ordersService, OrdersService } from "../modules/orders/orders.service";
import type { OrderAggregate, OrderItemRow } from "../modules/orders/orders.types";
import { preparationService, PreparationService } from "../modules/preparation/preparation.service";
import { transfersRepository, type TransfersRepository } from "../modules/transfers/transfers.repository";
import { transfersService, TransfersService } from "../modules/transfers/transfers.service";

const actorId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const itemId = "44444444-4444-4444-8444-444444444444";
const productId = "55555555-5555-4555-8555-555555555555";
const additionId = "66666666-6666-4666-8666-666666666666";
const pointId = "77777777-7777-4777-8777-777777777777";

function actor(role: UserRole): AuthenticatedUser {
  return { id: actorId, fullName: "Operador", username: "operador", role, capabilities: getCapabilitiesForRole(role) };
}

function authenticateAs(role: UserRole) {
  mock.method(authService, "getCurrentUser", async () => actor(role));
}

function orderItem(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: itemId, order_id: orderId, current_service_session_id: sessionId,
    line_number: 1, product_id: productId, product_name: "Clásica", unit_price: 15,
    quantity: 1, notes: null, preparation_station: "KITCHEN", status: "PENDING",
    preparing_at: null, ready_at: null, delivered_at: null, cancelled_by: null,
    cancelled_by_role: null, cancelled_at: null, cancellation_reason: null,
    cancelled_from_status: null, created_at: "2026-08-26T18:00:00.000Z",
    updated_at: "2026-08-26T18:00:00.000Z", ...overrides,
  };
}

function aggregate(items = [orderItem()]): OrderAggregate {
  return {
    order: { id: orderId, service_session_id: sessionId, sequence_number: 12, notes: "Mesa", sent_at: "2026-08-26T18:00:00.000Z", created_by: actorId, created_by_role: "WAITER", created_at: "2026-08-26T18:00:00.000Z" },
    originalSession: { id: sessionId, service_point_id: pointId, shift_id: productId, opened_by: actorId, opened_by_role: "WAITER", closed_by: null, closed_by_role: null, status: "OPEN", cancellation_reason: null, opened_at: "2026-08-26T17:00:00.000Z", closed_at: null },
    servicePoint: { id: pointId, name: "Mesa 1", type: "TABLE", sort_order: 1, is_active: true },
    creator: { id: actorId, full_name: "Juan Mesero" },
    items: items.map((item, index) => ({
      item,
      additions: index === 0 ? [{ id: additionId, order_item_id: item.id, product_id: additionId, addition_name: "Huevo", unit_price: 2, quantity_per_item: 1, created_at: item.created_at }] : [],
    })),
  };
}

function fakeOrdersRepository(value = aggregate()): OrdersRepository {
  return {
    async create() { return { id: orderId }; },
    async findOrder(id) { return id === orderId ? value : null; },
    async listForCurrentSession() { return { session: value.originalSession, point: value.servicePoint, orders: [value] }; },
    async listQueue() { return []; },
    async findItem() { return value.items[0]?.item ?? null; },
    async transition() { return { orderItemId: itemId, status: "PREPARING", preparationStation: "KITCHEN", preparingAt: "2026-08-26T18:01:00.000Z", readyAt: null, deliveredAt: null }; },
    async cancel() { return { orderItemId: itemId, status: "CANCELLED", cancelledFromStatus: "PENDING", cancelledAt: "2026-08-26T18:01:00.000Z", cancellationReason: "Cliente" }; },
  };
}

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => mock.restoreAll());
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

const headers = { authorization: "Bearer test", "content-type": "application/json" };

describe("logistics schemas, reads and RPC mapping", () => {
  test("create-order validation accepts additions and preserves distinct lines", () => {
    const parsed = createOrderSchema.parse({ items: [
      { productId, quantity: 1, additions: [{ productId: additionId, quantityPerItem: 1 }] },
      { productId, quantity: 1, additions: [] },
    ] });
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0]?.additions.length, 1);
    assert.equal(parsed.items[1]?.additions.length, 0);
    assert.equal(createOrderSchema.safeParse({ items: [] }).success, false);
    assert.equal(createOrderSchema.safeParse({ items: [{ productId, quantity: 0, additions: [] }] }).success, false);
  });

  test("order responses use snapshots and expose current session ownership", async () => {
    const movedSession = "88888888-8888-4888-8888-888888888888";
    const result = await new OrdersService(fakeOrdersRepository(aggregate([orderItem({ current_service_session_id: movedSession })]))).get(orderId);
    assert.equal(result.items[0]?.productName, "Clásica");
    assert.equal(result.items[0]?.additions[0]?.additionName, "Huevo");
    assert.equal(result.items[0]?.currentServiceSessionId, movedSession);
    assert.equal(result.createdBy.role, "WAITER");
  });

  test("missing orders return 404", async () => {
    await assert.rejects(new OrdersService(fakeOrdersRepository()).get(productId), (error: AppError) => error.statusCode === 404 && error.code === "ORDER_NOT_FOUND");
  });

  test("central mapper classifies domain codes and hides raw messages", () => {
    const missing = mapRpcError({ code: "P0001", message: "PRODUCT_NOT_FOUND" }, "FAILED");
    const inactive = mapRpcError({ code: "P0001", message: "PRODUCT_INACTIVE" }, "FAILED");
    const conflict = mapRpcError({ code: "P0001", message: "SERVICE_POINT_OCCUPIED" }, "FAILED");
    assert.equal(missing.statusCode, 404);
    assert.equal(inactive.statusCode, 409);
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.message.includes("PostgREST"), false);
  });

  test("central mapper covers operational state, cancellation and transfer errors", () => {
    const cases: Array<[string, number]> = [
      ["SERVICE_SESSION_NOT_FOUND", 404],
      ["ORDER_ITEM_NOT_FOUND", 404],
      ["SHIFT_NOT_OPEN", 409],
      ["SERVICE_SESSION_NOT_OPEN", 409],
      ["PRODUCT_UNAVAILABLE", 409],
      ["PRODUCT_NOT_ORDERABLE", 409],
      ["PRODUCT_ADDITIONS_NOT_ALLOWED", 409],
      ["ORDER_ITEM_TRANSITION_NOT_ALLOWED", 409],
      ["ORDER_ITEM_ALREADY_CANCELLED", 409],
      ["ORDER_ITEM_CANCELLED", 409],
      ["SERVICE_SESSIONS_DIFFERENT_SHIFT", 409],
      ["TRANSFER_QUANTITY_EXCEEDS_AVAILABLE", 409],
    ];
    for (const [code, status] of cases) {
      const error = mapRpcError({ code: "P0001", message: code }, "FAILED");
      assert.equal(error.code, code);
      assert.equal(error.statusCode, status);
    }
  });

  test("create repository invokes only logistics_create_order with IDs and quantities", async () => {
    let calledName = "";
    let calledArgs: Record<string, unknown> | undefined;
    mock.method(supabaseAdmin, "rpc", async (name: string, args?: object) => {
      calledName = name;
      calledArgs = args as Record<string, unknown>;
      return { data: { id: orderId }, error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual table write/read was not expected"); });
    await ordersRepository.create(sessionId, { notes: "nota", items: [{ productId, quantity: 2, additions: [{ productId: additionId, quantityPerItem: 1 }] }] }, actor("WAITER"));
    assert.equal(calledName, "logistics_create_order");
    assert.equal(JSON.stringify(calledArgs).includes("productName"), false);
    assert.equal(JSON.stringify(calledArgs).includes("unitPrice"), false);
    assert.equal(JSON.stringify(calledArgs).includes("preparationStation"), false);
  });

  test("all operational mutations use their six approved RPCs", async () => {
    const names: string[] = [];
    mock.method(supabaseAdmin, "rpc", async (name: string) => {
      names.push(name);
      return { data: { id: productId, orderItemId: itemId }, error: null };
    });
    mock.method(supabaseAdmin, "from", () => { throw new Error("manual persistence was not expected"); });
    await logisticsCatalogRepository.setAvailability(productId, false, actor("WAITER"));
    await ordersRepository.transition(itemId, "START", actor("KITCHEN"));
    await ordersRepository.cancel(itemId, "Cliente", actor("WAITER"));
    await transfersRepository.transferSession(sessionId, { toServicePointId: pointId }, actor("WAITER"));
    await transfersRepository.transferOrderItem(itemId, { toSessionId: orderId, quantity: 1 }, actor("WAITER"));
    assert.deepEqual(names, [
      "logistics_set_product_availability",
      "logistics_transition_order_item",
      "logistics_cancel_order_item",
      "logistics_transfer_service_session",
      "logistics_transfer_order_item",
    ]);
  });

  test("transition actions and cancellation are delegated without Node state updates", async () => {
    const actions: string[] = [];
    const repository = fakeOrdersRepository();
    repository.transition = async (_id, action) => {
      actions.push(action);
      const statuses = { START: "PREPARING", READY: "READY", DELIVER: "DELIVERED" } as const;
      return { orderItemId: itemId, status: statuses[action], preparationStation: "KITCHEN" };
    };
    let cancelledReason = "";
    repository.cancel = async (_id, reason) => {
      cancelledReason = reason;
      return { orderItemId: itemId, status: "CANCELLED", cancelledFromStatus: "DELIVERED", cancellationReason: reason };
    };
    const service = new OrdersService(repository);
    await service.transition(itemId, "START", actor("KITCHEN"));
    await service.transition(itemId, "READY", actor("KITCHEN"));
    await service.transition(itemId, "DELIVER", actor("KITCHEN"));
    const cancelled = await service.cancel(itemId, "Error de pedido", actor("WAITER"));
    assert.deepEqual(actions, ["START", "READY", "DELIVER"]);
    assert.equal(cancelledReason, "Error de pedido");
    assert.equal(cancelled.status, "CANCELLED");
  });

  test("kitchen and drinks queues are filtered and ordered by sentAt", async () => {
    const repository = fakeOrdersRepository();
    const seen: string[] = [];
    repository.listQueue = async (station) => {
      seen.push(station);
      return [
        { item: orderItem({ preparation_station: station }), additions: [], order: { ...aggregate().order, sent_at: "2026-08-26T18:10:00.000Z" }, currentSession: aggregate().originalSession, servicePoint: aggregate().servicePoint },
        { item: orderItem({ id: additionId, preparation_station: station }), additions: [], order: { ...aggregate().order, id: productId, sent_at: "2026-08-26T18:00:00.000Z" }, currentSession: aggregate().originalSession, servicePoint: aggregate().servicePoint },
      ];
    };
    const service = new PreparationService(repository);
    const kitchen = await service.queue("KITCHEN");
    await service.queue("DRINKS");
    assert.deepEqual(seen, ["KITCHEN", "DRINKS"]);
    assert.equal(kitchen[0]?.order.sentAt, "2026-08-26T18:00:00.000Z");
  });

  test("complete and partial transfers preserve the RPC result semantics", async () => {
    let split = false;
    const repository: TransfersRepository = {
      async transferSession(id) { return { serviceSessionId: id, transferId: productId, fromServicePointId: pointId, fromServicePointName: "Mesa 1", toServicePointId: additionId, toServicePointName: "Mesa 2", transferredAt: "2026-08-26T18:00:00.000Z" }; },
      async transferOrderItem(id, input) { return { orderItemId: id, sourceOrderItemId: itemId, transferId: productId, fromServiceSessionId: sessionId, toServiceSessionId: input.toSessionId, quantity: input.quantity, remainingQuantity: split ? 2 : 0, split, status: "PENDING" }; },
    };
    const service = new TransfersService(repository);
    const complete = await service.transferOrderItem(itemId, { toSessionId: orderId, quantity: 3 }, actor("WAITER"));
    split = true;
    const partial = await service.transferOrderItem(itemId, { toSessionId: orderId, quantity: 1 }, actor("WAITER"));
    const session = await service.transferSession(sessionId, { toServicePointId: additionId }, actor("WAITER"));
    assert.equal(complete.split, false);
    assert.equal(complete.remainingQuantity, 0);
    assert.equal(partial.split, true);
    assert.equal(partial.remainingQuantity, 2);
    assert.equal(session.serviceSessionId, sessionId);
  });
});

describe("logistics route capabilities and validation", () => {
  test("private catalog reads and allowed availability changes work", async () => {
    authenticateAs("WAITER");
    mock.method(logisticsCatalogService, "listCategories", async () => [{ id: productId, name: "Hamburguesas", slug: "hamburguesas", sortOrder: 1 }]);
    mock.method(logisticsCatalogService, "listProducts", async (category?: string) => {
      assert.equal(category, "hamburguesas");
      return [{ id: productId, categoryId: additionId, name: "Clásica", description: null, price: 15, imagePath: null, isAvailable: true, preparationStation: "KITCHEN" as const, allowsAdditions: true }];
    });
    mock.method(logisticsCatalogService, "setAvailability", async (_id: string, isAvailable: boolean) => ({ productId, isAvailable }));
    const list = await fetch(`${baseUrl}/api/logistics/catalog/categories`, { headers });
    const products = await fetch(`${baseUrl}/api/logistics/catalog/products?category=hamburguesas`, { headers });
    const patch = await fetch(`${baseUrl}/api/logistics/catalog/products/${productId}/availability`, { method: "PATCH", headers, body: JSON.stringify({ isAvailable: false }) });
    assert.equal(list.status, 200);
    assert.equal(products.status, 200);
    assert.equal(patch.status, 200);
  });

  test("KITCHEN cannot change availability", async () => {
    authenticateAs("KITCHEN");
    const response = await fetch(`${baseUrl}/api/logistics/catalog/products/${productId}/availability`, { method: "PATCH", headers, body: JSON.stringify({ isAvailable: false }) });
    assert.equal(response.status, 403);
  });

  test("invalid order request is rejected before the service", async () => {
    authenticateAs("WAITER");
    const call = mock.method(ordersRepository, "create", async () => ({ id: orderId }));
    const response = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/orders`, { method: "POST", headers, body: JSON.stringify({ items: [{ productId, quantity: 0 }] }) });
    assert.equal(response.status, 400);
    assert.equal(call.mock.callCount(), 0);
  });

  test("valid order requests use authenticated actor and return a snapshot response", async () => {
    authenticateAs("WAITER");
    mock.method(ordersService, "create", async (_sessionId: string, input: CreateOrderInput, currentActor: AuthenticatedUser) => {
      assert.equal(currentActor.id, actorId);
      assert.equal(input.items[0]?.additions[0]?.quantityPerItem, 1);
      return new OrdersService(fakeOrdersRepository()).get(orderId);
    });
    const response = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/orders`, {
      method: "POST", headers,
      body: JSON.stringify({ items: [{ productId, quantity: 2, notes: "sin cebolla", additions: [{ productId: additionId, quantityPerItem: 1 }] }] }),
    });
    const body = await response.json() as { order: { items: Array<{ productName: string }> } };
    assert.equal(response.status, 201);
    assert.equal(body.order.items[0]?.productName, "Clásica");
  });

  test("queues apply station view capabilities", async () => {
    authenticateAs("KITCHEN");
    mock.method(preparationService, "queue", async (station: "KITCHEN" | "DRINKS") => { assert.equal(station, "KITCHEN"); return []; });
    const kitchen = await fetch(`${baseUrl}/api/logistics/preparation/kitchen`, { headers });
    const drinks = await fetch(`${baseUrl}/api/logistics/preparation/drinks`, { headers });
    assert.equal(kitchen.status, 200);
    assert.equal(drinks.status, 403);
  });

  test("station middleware denies WAITER on KITCHEN and KITCHEN on DRINKS", async () => {
    authenticateAs("WAITER");
    mock.method(ordersRepository, "findItem", async () => orderItem({ preparation_station: "KITCHEN" }));
    const waiter = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/start`, { method: "POST", headers, body: "{}" });
    mock.restoreAll();
    authenticateAs("KITCHEN");
    mock.method(ordersRepository, "findItem", async () => orderItem({ preparation_station: "DRINKS" }));
    const kitchen = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/start`, { method: "POST", headers, body: "{}" });
    assert.equal(waiter.status, 403);
    assert.equal(kitchen.status, 403);
  });

  test("CASHIER is read-only while ADMIN can transition both stations", async () => {
    authenticateAs("CASHIER");
    mock.method(ordersRepository, "findItem", async () => orderItem());
    const cashier = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/start`, { method: "POST", headers, body: "{}" });
    mock.restoreAll();
    authenticateAs("ADMIN");
    mock.method(ordersRepository, "findItem", async () => orderItem({ preparation_station: "DRINKS" }));
    mock.method(ordersService, "transition", async () => ({ orderItemId: itemId, status: "PREPARING" }));
    const admin = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/start`, { method: "POST", headers, body: "{}" });
    assert.equal(cashier.status, 403);
    assert.equal(admin.status, 200);
  });

  test("cancellation requires a reason and KITCHEN is forbidden", async () => {
    authenticateAs("WAITER");
    const invalid = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/cancel`, { method: "POST", headers, body: JSON.stringify({ reason: "" }) });
    mock.restoreAll();
    authenticateAs("KITCHEN");
    const forbidden = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/cancel`, { method: "POST", headers, body: JSON.stringify({ reason: "Cliente" }) });
    assert.equal(invalid.status, 400);
    assert.equal(forbidden.status, 403);
  });

  test("session and partial item transfers reach their services", async () => {
    authenticateAs("WAITER");
    const sessionCall = mock.method(transfersService, "transferSession", async () => ({ serviceSessionId: sessionId }));
    const itemCall = mock.method(transfersService, "transferOrderItem", async (_id: string, input: { toSessionId: string; quantity: number; reason?: string }) => ({ orderItemId: itemId, split: input.quantity < 3 }));
    const sessionResponse = await fetch(`${baseUrl}/api/logistics/sessions/${sessionId}/transfer`, { method: "POST", headers, body: JSON.stringify({ toServicePointId: pointId }) });
    const itemResponse = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/transfer`, { method: "POST", headers, body: JSON.stringify({ toSessionId: orderId, quantity: 1 }) });
    assert.equal(sessionResponse.status, 200);
    assert.equal(itemResponse.status, 200);
    assert.equal(sessionCall.mock.callCount(), 1);
    assert.equal(itemCall.mock.callCount(), 1);
  });

  test("invalid transfer quantity is rejected", async () => {
    authenticateAs("WAITER");
    const response = await fetch(`${baseUrl}/api/logistics/order-items/${itemId}/transfer`, { method: "POST", headers, body: JSON.stringify({ toSessionId: orderId, quantity: 0 }) });
    assert.equal(response.status, 400);
  });
});
