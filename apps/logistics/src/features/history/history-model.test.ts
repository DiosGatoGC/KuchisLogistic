import assert from "node:assert/strict";
import test from "node:test";

import {
  auditDetailEntries,
  historyDetailError,
  historyListPath,
  historyPermissions,
  isValidHistoryShiftId,
  normalizeHistoryDetail,
  normalizeHistoryList,
  normalizeHistoryPage,
  normalizeHistoryPageSize,
  safeHistoryPage,
} from "./history-model.ts";
import type { HistoricalActor, HistoryDetail, HistoryListResult } from "./history-types.ts";

const actor: HistoricalActor = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: null,
  fullNameSource: "CURRENT_PROFILE",
  role: "MANAGER",
};

function listResult(): HistoryListResult {
  return {
    items: [{
      shiftId: "22222222-2222-4222-8222-222222222222",
      openedAt: "2026-09-01T10:00:00.000Z",
      closedAt: "2026-09-01T18:00:00.000Z",
      openedBy: actor,
      closedBy: null,
      businessSalesTotal: 101.25,
      cashTotal: 40,
      yapeTotal: 31.25,
      cardTotal: 30,
      cardFeeTotal: 1.5,
      customerCardTotal: 31.5,
      operationalExpensesTotal: 8.75,
      serviceSessionsCount: 5,
      ordersCount: 7,
      reconciliationExists: true,
    }],
    pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
  };
}

function detail(): HistoryDetail {
  const shiftId = "22222222-2222-4222-8222-222222222222";
  return {
    shift: { id: shiftId, status: "CLOSED", openingCash: 25, openedAt: "2026-09-01T10:00:00Z", closedAt: "2026-09-01T18:00:00Z", openedBy: actor, closedBy: actor },
    closure: { id: "closure", shiftId, closedBy: actor, createdAt: "2026-09-01T18:00:00Z", businessSalesTotal: 101.25, cashTotal: 40, yapeTotal: 31.25, cardTotal: 30, cardFeeTotal: 1.5, customerCardTotal: 31.5, operationalExpensesCount: 1, operationalExpensesTotal: 8.75, serviceSessionsCount: 1, cancelledSessionsCount: 0, ordersCount: 1, orderItemsCount: 1, productUnitsCount: 2, cancelledOrderItemsCount: 0, cancelledPendingCount: 0, cancelledPreparingCount: 0, cancelledReadyCount: 0, cancelledDeliveredCount: 0, serviceSessionTransfersCount: 1, orderItemTransfersCount: 1, closingNotes: null, summary: {}, expectedCashAtClose: 56.25 },
    reconciliation: { id: "reconciliation", shiftId, reconciledBy: actor, createdAt: "2026-09-01T18:10:00Z", openingCashSnapshot: 25, cashSalesExpected: 40, cashExpensesSnapshot: 8.75, expectedCash: 56.25, countedCash: 55, cashDifference: -1.25, expectedYape: 31.25, confirmedYape: 32, yapeDifference: 0.75, expectedCardBusiness: 30, expectedCardFee: 1.5, expectedCardCustomerTotal: 31.5, confirmedCardCustomerTotal: 31.5, cardDifference: 0, notes: null },
    serviceSessions: [{ id: "session", shiftId, status: "PAID", openedAt: "2026-09-01T11:00:00Z", closedAt: "2026-09-01T12:00:00Z", openedBy: actor, closedBy: actor, cancellationReason: null, servicePoint: { id: "point", name: "Mesa 1", type: "TABLE", nameSource: "CURRENT_SERVICE_POINT" } }],
    orders: [{ id: "order", originalServiceSessionId: "session", sequenceNumber: 1, notes: null, sentAt: "2026-09-01T11:10:00Z", createdAt: "2026-09-01T11:09:00Z", createdBy: actor, items: [{ id: "item", orderId: "order", currentServiceSessionId: "session", lineNumber: 1, productId: "product", productName: "Ceviche", unitPrice: 30, quantity: 2, notes: "Sin ají", preparationStation: "KITCHEN", status: "DELIVERED", createdAt: "2026-09-01T11:09:00Z", updatedAt: "2026-09-01T11:30:00Z", preparingAt: "2026-09-01T11:12:00Z", readyAt: "2026-09-01T11:25:00Z", deliveredAt: "2026-09-01T11:30:00Z", cancellation: null, additions: [{ id: "addition", productId: "addition-product", additionName: "Camote", unitPrice: 2, quantityPerItem: 1, createdAt: "2026-09-01T11:09:00Z" }] }] }],
    payments: [{ id: "payment", serviceSessionId: "session", method: "CARD", businessAmount: 30, feeRate: 0.05, feeAmount: 1.5, customerTotal: 31.5, paidAt: "2026-09-01T12:00:00Z", receivedBy: actor }],
    expenses: [{ id: "expense", category: "OTHER", customCategory: "Movilidad", description: "Taxi", amount: 8.75, recordedAt: "2026-09-01T13:00:00Z", recordedBy: actor, voidedAt: "2026-09-01T14:00:00Z", voidReason: "Duplicado", voidedBy: actor }],
    transfers: {
      serviceSessions: [{ id: "session-transfer", serviceSessionId: "session", fromServicePoint: { id: "point-1", name: "Mesa 1", nameSource: "TRANSFER_SNAPSHOT" }, toServicePoint: { id: "point-2", name: "Mesa 2", nameSource: "TRANSFER_SNAPSHOT" }, reason: "Cambio", transferredAt: "2026-09-01T11:20:00Z", transferredBy: actor }],
      orderItems: [{ id: "item-transfer", orderItemId: "item", fromServiceSessionId: "session", toServiceSessionId: "session-2", fromServicePoint: { id: "point-1", name: "Mesa 1", nameSource: "TRANSFER_SNAPSHOT" }, toServicePoint: { id: "point-2", name: "Mesa 2", nameSource: "TRANSFER_SNAPSHOT" }, quantity: 1, statusAtTransfer: "PENDING", reason: "Separar", transferredAt: "2026-09-01T11:21:00Z", transferredBy: actor }],
    },
    audit: [{ id: "audit", action: "ORDER_ITEM_TRANSFERRED", entity: "order_item", entityId: "item", serviceSessionId: "session", actor, details: { quantity: 1 }, createdAt: "2026-09-01T11:21:00Z" }],
  };
}

test("construye paginación exacta y limita page/pageSize", () => {
  assert.equal(historyListPath(3, 50), "/api/logistics/history/shifts?page=3&pageSize=50");
  assert.equal(historyListPath(0, 200), "/api/logistics/history/shifts?page=1&pageSize=100");
  assert.equal(normalizeHistoryPage(2.5), 1);
  assert.equal(normalizeHistoryPageSize(Number.NaN), 20);
});

test("normaliza lista, metadatos, actores nulos y flags de cuadre sin alterar dinero", () => {
  const source = listResult();
  const normalized = normalizeHistoryList(source);
  assert.notEqual(normalized.items, source.items);
  assert.deepEqual(normalized.pagination, { page: 2, pageSize: 20, total: 41, totalPages: 3 });
  assert.equal(normalized.items[0]?.businessSalesTotal, 101.25);
  assert.equal(normalized.items[0]?.cardFeeTotal, 1.5);
  assert.equal(normalized.items[0]?.openedBy?.fullName, null);
  assert.equal(normalized.items[0]?.closedBy, null);
  assert.equal(normalized.items[0]?.reconciliationExists, true);
  source.items[0]!.reconciliationExists = false;
  assert.equal(normalizeHistoryList(source).items[0]?.reconciliationExists, false);
});

test("cero historial y página obsoleta recuperan una página segura", () => {
  assert.equal(safeHistoryPage({ page: 4, pageSize: 20, total: 0, totalPages: 0 }), 1);
  assert.equal(safeHistoryPage({ page: 4, pageSize: 20, total: 21, totalPages: 2 }), 2);
});

test("normaliza detalle completo y conserva diferencias firmadas y cuadre nulo", () => {
  const source = detail();
  const normalized = normalizeHistoryDetail(source);
  assert.equal(normalized.reconciliation?.cashDifference, -1.25);
  assert.equal(normalized.reconciliation?.yapeDifference, 0.75);
  assert.equal(normalized.reconciliation?.cardDifference, 0);
  assert.equal(normalized.orders[0]?.items[0]?.additions[0]?.additionName, "Camote");
  assert.equal(normalized.payments[0]?.customerTotal, 31.5);
  assert.equal(normalized.expenses[0]?.voidReason, "Duplicado");
  assert.equal(normalized.transfers.serviceSessions[0]?.fromServicePoint.name, "Mesa 1");
  assert.equal(normalized.transfers.orderItems[0]?.quantity, 1);
  assert.equal(normalized.audit[0]?.action, "ORDER_ITEM_TRANSFERRED");
  assert.notEqual(normalized.orders, source.orders);
  assert.equal(normalizeHistoryDetail({ ...source, reconciliation: null }).reconciliation, null);
});

test("valida UUID de entrada directa y modela detalle inexistente", () => {
  assert.equal(isValidHistoryShiftId("22222222-2222-4222-8222-222222222222"), true);
  assert.equal(isValidHistoryShiftId("no-es-uuid"), false);
  assert.equal(historyDetailError({ code: "SHIFT_HISTORY_NOT_FOUND" }).title, "Turno no encontrado");
});

test("capability gating es exclusivo de history.view y no expone mutaciones", () => {
  assert.deepEqual(historyPermissions([]), { canView: false });
  assert.deepEqual(historyPermissions(["history.view"]), { canView: true });
  assert.equal(Object.keys(historyPermissions(["history.view"])).some((key) => key.includes("Manage")), false);
});

test("auditoría presenta campos sin volcar JSON crudo", () => {
  assert.deepEqual(auditDetailEntries({ details: { quantity: 1, nested: { id: "x" }, values: [1, 2] } }), [
    { label: "quantity", value: "1" },
    { label: "nested", value: "Información estructurada" },
    { label: "values", value: "2 elementos" },
  ]);
});
