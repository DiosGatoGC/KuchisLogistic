import assert from "node:assert/strict";
import test from "node:test";
import {
  adminClient,
  assertLocalEnvironment,
  bootstrapProfile,
  createOrder,
  deliverItem,
  fixtures,
  login,
  openPoint,
  openShift,
  paySession,
  request,
  startApi,
} from "./local-harness";

assertLocalEnvironment();

function cents(value: number) {
  return Math.round(value * 100);
}

test("real HTTP to PostgreSQL logistics lifecycle", { timeout: 120_000 }, async (t) => {
  const database = adminClient();
  const admin = await bootstrapProfile(database, { label: "admin-main" });
  const api = await startApi();
  t.after(() => api.close());

  const token = await login(api.baseUrl, admin.username);
  const authHeaders = { token };

  const me = await request(api.baseUrl, "/api/logistics/auth/me", authHeaders);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, admin.id);
  assert.equal(me.body.user.role, "ADMIN");
  assert.equal("auth_email" in me.body.user, false);

  const fixture = await fixtures(database);
  assert.deepEqual(
    fixture.points.map((point) => [point.name, point.type, point.sort_order]),
    [
      ...Array.from({ length: 7 }, (_, index) => [`Mesa ${index + 1}`, "TABLE", index + 1]),
      ...Array.from({ length: 4 }, (_, index) => [`B${index + 1}`, "BAR", index + 8]),
      ...Array.from({ length: 7 }, (_, index) => [`LL${index + 1}`, "TAKEAWAY", index + 12]),
    ]
  );

  const listedPoints = await request(api.baseUrl, "/api/logistics/service-points", authHeaders);
  assert.equal(listedPoints.status, 200);
  assert.equal(listedPoints.body.servicePoints.length, 18);

  const shift = await openShift(api.baseUrl, token, 100);
  const currentShift = await request(api.baseUrl, "/api/logistics/shifts/current", authHeaders);
  assert.equal(currentShift.status, 200);
  assert.equal(currentShift.body.shift.id, shift.id);

  const primarySession = await openPoint(api.baseUrl, token, fixture.points[0]!.id);
  const primaryOrder = await createOrder(api.baseUrl, token, primarySession.id, [
    {
      productId: fixture.kitchen.id,
      quantity: 2,
      additions: [{ productId: fixture.addition.id, quantityPerItem: 1 }],
    },
    { productId: fixture.drinks.id, quantity: 1 },
  ]);
  assert.equal(primaryOrder.items.length, 2);
  const kitchenItem = primaryOrder.items.find((item: any) => item.preparationStation === "KITCHEN");
  const drinksItem = primaryOrder.items.find((item: any) => item.preparationStation === "DRINKS");
  assert.ok(kitchenItem);
  assert.ok(drinksItem);
  assert.equal(kitchenItem.additions.length, 1);

  const [sessionDetail, orderList, orderDetail, kitchenQueue, drinksQueue] = await Promise.all([
    request(api.baseUrl, `/api/logistics/sessions/${primarySession.id}`, authHeaders),
    request(api.baseUrl, `/api/logistics/sessions/${primarySession.id}/orders`, authHeaders),
    request(api.baseUrl, `/api/logistics/orders/${primaryOrder.id}`, authHeaders),
    request(api.baseUrl, "/api/logistics/preparation/kitchen", authHeaders),
    request(api.baseUrl, "/api/logistics/preparation/drinks", authHeaders),
  ]);
  assert.equal(sessionDetail.status, 200);
  assert.equal(orderList.status, 200);
  assert.equal(orderList.body.orders.length, 1);
  assert.equal(orderDetail.body.order.id, primaryOrder.id);
  assert.ok(kitchenQueue.body.items.some((entry: any) => entry.orderItem.id === kitchenItem.id));
  assert.ok(drinksQueue.body.items.some((entry: any) => entry.orderItem.id === drinksItem.id));

  await deliverItem(api.baseUrl, token, kitchenItem.id);
  await deliverItem(api.baseUrl, token, drinksItem.id);

  const primaryPreview = await request(
    api.baseUrl,
    `/api/logistics/sessions/${primarySession.id}/checkout`,
    authHeaders
  );
  assert.equal(primaryPreview.status, 200);
  const expectedPrimary =
    (Number(fixture.kitchen.price) + Number(fixture.addition.price)) * 2 +
    Number(fixture.drinks.price);
  assert.equal(cents(primaryPreview.body.checkout.businessAmount), cents(expectedPrimary));
  assert.equal(
    cents(primaryPreview.body.checkout.paymentOptions.CARD.customerTotal),
    cents(expectedPrimary) + Math.round(cents(expectedPrimary) * 0.05)
  );

  const cardPayment = await paySession(api.baseUrl, token, primarySession.id, "CARD");
  assert.equal(cardPayment.method, "CARD");
  assert.equal(cardPayment.feeRate, 0.05);
  assert.equal(cents(cardPayment.businessAmount), cents(expectedPrimary));
  assert.equal(cents(cardPayment.feeAmount), Math.round(cents(expectedPrimary) * 0.05));
  assert.equal(
    cents(cardPayment.customerTotal),
    cents(cardPayment.businessAmount) + cents(cardPayment.feeAmount)
  );

  const [storedCard, paidSession, pointAfterPayment, paymentAudit] = await Promise.all([
    database.from("payments").select("*").eq("id", cardPayment.paymentId).single(),
    database.from("service_sessions").select("status").eq("id", primarySession.id).single(),
    database.from("service_sessions").select("id").eq("service_point_id", fixture.points[0]!.id).in("status", ["OPEN", "AWAITING_PAYMENT"]),
    database.from("audit_logs").select("action").eq("entity_id", cardPayment.paymentId).eq("action", "PAYMENT_CONFIRMED"),
  ]);
  assert.ifError(storedCard.error);
  assert.equal(storedCard.data.business_amount, cardPayment.businessAmount);
  assert.equal(storedCard.data.customer_total, cardPayment.customerTotal);
  assert.equal(paidSession.data?.status, "PAID");
  assert.equal(pointAfterPayment.data?.length, 0);
  assert.equal(paymentAudit.data?.length, 1);

  const cashSession = await openPoint(api.baseUrl, token, fixture.points[1]!.id);
  const cashOrder = await createOrder(api.baseUrl, token, cashSession.id, [
    { productId: fixture.kitchen.id, quantity: 1 },
  ]);
  await deliverItem(api.baseUrl, token, cashOrder.items[0].id);
  const cashPayment = await paySession(api.baseUrl, token, cashSession.id, "CASH");
  assert.equal(cashPayment.feeRate, 0);
  assert.equal(cashPayment.feeAmount, 0);
  assert.equal(cashPayment.customerTotal, cashPayment.businessAmount);

  const yapeSession = await openPoint(api.baseUrl, token, fixture.points[2]!.id);
  const yapeOrder = await createOrder(api.baseUrl, token, yapeSession.id, [
    { productId: fixture.drinks.id, quantity: 1 },
  ]);
  await deliverItem(api.baseUrl, token, yapeOrder.items[0].id);
  const yapePayment = await paySession(api.baseUrl, token, yapeSession.id, "YAPE");
  assert.equal(yapePayment.feeRate, 0);
  assert.equal(yapePayment.feeAmount, 0);

  const firstExpense = await request(api.baseUrl, "/api/logistics/expenses", {
    method: "POST",
    token,
    body: { category: "SUPPLIES", description: "Insumo E2E", amount: 8.5 },
  });
  const secondExpense = await request(api.baseUrl, "/api/logistics/expenses", {
    method: "POST",
    token,
    body: { category: "OTHER", customCategory: "Prueba", description: "Gasto anulable", amount: 4.25 },
  });
  assert.equal(firstExpense.status, 201);
  assert.equal(secondExpense.status, 201);
  const voidedExpense = await request(
    api.baseUrl,
    `/api/logistics/expenses/${secondExpense.body.expense.id}/void`,
    { method: "POST", token, body: { reason: "Dato de prueba reemplazado" } }
  );
  assert.equal(voidedExpense.status, 200);
  assert.equal(voidedExpense.body.expense.voided, true);
  const currentExpenses = await request(api.baseUrl, "/api/logistics/expenses/current", authHeaders);
  assert.equal(currentExpenses.body.expenses.length, 2);
  assert.equal(currentExpenses.body.activeExpensesCount, 1);
  assert.equal(currentExpenses.body.activeExpensesTotal, 8.5);

  const transferOrigin = await openPoint(api.baseUrl, token, fixture.points[3]!.id);
  const sessionTransfer = await request(
    api.baseUrl,
    `/api/logistics/sessions/${transferOrigin.id}/transfer`,
    {
      method: "POST",
      token,
      body: { toServicePointId: fixture.points[4]!.id, reason: "Cambio de mesa E2E" },
    }
  );
  assert.equal(sessionTransfer.status, 200);
  assert.equal(sessionTransfer.body.transfer.serviceSessionId, transferOrigin.id);
  assert.equal(sessionTransfer.body.transfer.toServicePoint.id, fixture.points[4]!.id);

  const transferDestination = await openPoint(api.baseUrl, token, fixture.points[5]!.id);
  const transferOrder = await createOrder(api.baseUrl, token, transferOrigin.id, [
    {
      productId: fixture.kitchen.id,
      quantity: 3,
      additions: [{ productId: fixture.addition.id, quantityPerItem: 1 }],
    },
    { productId: fixture.drinks.id, quantity: 1 },
    { productId: fixture.kitchen.id, quantity: 1 },
  ]);
  const transferableKitchen = transferOrder.items[0];
  const transferableDrink = transferOrder.items[1];
  const cancellableItem = transferOrder.items[2];

  const fullTransfer = await request(
    api.baseUrl,
    `/api/logistics/order-items/${transferableDrink.id}/transfer`,
    {
      method: "POST",
      token,
      body: { toSessionId: transferDestination.id, quantity: 1, reason: "Transferencia total E2E" },
    }
  );
  assert.equal(fullTransfer.status, 200);
  assert.equal(fullTransfer.body.transfer.split, false);
  assert.equal(fullTransfer.body.transfer.remainingQuantity, 0);

  const partialTransfer = await request(
    api.baseUrl,
    `/api/logistics/order-items/${transferableKitchen.id}/transfer`,
    {
      method: "POST",
      token,
      body: { toSessionId: transferDestination.id, quantity: 1, reason: "Split E2E" },
    }
  );
  assert.equal(partialTransfer.status, 200);
  assert.equal(partialTransfer.body.transfer.split, true);
  assert.equal(partialTransfer.body.transfer.remainingQuantity, 2);
  const splitItemId = partialTransfer.body.transfer.orderItemId as string;

  const [sourceAdditions, splitAdditions] = await Promise.all([
    database.from("order_item_additions").select("product_id, unit_price, quantity_per_item").eq("order_item_id", transferableKitchen.id),
    database.from("order_item_additions").select("product_id, unit_price, quantity_per_item").eq("order_item_id", splitItemId),
  ]);
  assert.ifError(sourceAdditions.error);
  assert.ifError(splitAdditions.error);
  assert.deepEqual(splitAdditions.data, sourceAdditions.data);

  const cancelled = await request(
    api.baseUrl,
    `/api/logistics/order-items/${cancellableItem.id}/cancel`,
    { method: "POST", token, body: { reason: "Cliente cambió de opinión" } }
  );
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.orderItem.status, "CANCELLED");
  assert.equal(cancelled.body.orderItem.cancelledFromStatus, "PENDING");
  assert.equal(cancelled.body.orderItem.cancellationReason, "Cliente cambió de opinión");

  await Promise.all([
    deliverItem(api.baseUrl, token, transferableKitchen.id),
    deliverItem(api.baseUrl, token, transferableDrink.id),
    deliverItem(api.baseUrl, token, splitItemId),
  ]);
  await paySession(api.baseUrl, token, transferOrigin.id, "CASH");
  await paySession(api.baseUrl, token, transferDestination.id, "YAPE");

  const cancellationTrace = await database
    .from("order_items")
    .select("status, cancelled_at, cancelled_by, cancelled_by_role, cancelled_from_status, cancellation_reason")
    .eq("id", cancellableItem.id)
    .single();
  assert.ifError(cancellationTrace.error);
  assert.equal(cancellationTrace.data.status, "CANCELLED");
  assert.equal(cancellationTrace.data.cancelled_by, admin.id);
  assert.equal(cancellationTrace.data.cancelled_by_role, "ADMIN");
  assert.ok(cancellationTrace.data.cancelled_at);

  const emptySession = await openPoint(api.baseUrl, token, fixture.points[6]!.id);
  const released = await request(api.baseUrl, `/api/logistics/sessions/${emptySession.id}/release`, {
    method: "POST",
    token,
    body: { reason: "Sesión E2E sin consumo" },
  });
  assert.equal(released.status, 200);
  assert.equal(released.body.session.sessionStatus, "CANCELLED");
  assert.equal(released.body.session.businessAmount, 0);
  const [releasedPayment, releasedPoint, releasedAudit] = await Promise.all([
    database.from("payments").select("id").eq("service_session_id", emptySession.id),
    database.from("service_sessions").select("status").eq("id", emptySession.id).single(),
    database.from("audit_logs").select("action").eq("service_session_id", emptySession.id).eq("action", "SERVICE_SESSION_RELEASED"),
  ]);
  assert.equal(releasedPayment.data?.length, 0);
  assert.equal(releasedPoint.data?.status, "CANCELLED");
  assert.equal(releasedAudit.data?.length, 1);

  const close = await request(api.baseUrl, `/api/logistics/shifts/${shift.id}/close`, {
    method: "POST",
    token,
    body: { closingNotes: "Cierre integral E2E" },
  });
  assert.equal(close.status, 201);
  const closure = close.body.closure;
  assert.equal(closure.shiftStatus, "CLOSED");
  assert.equal(closure.operationalExpensesCount, 1);
  assert.equal(closure.operationalExpensesTotal, 8.5);
  assert.equal(
    cents(closure.expectedCashAtClose),
    cents(closure.openingCash) + cents(closure.cashTotal) - cents(closure.operationalExpensesTotal)
  );
  assert.ok(closure.expectedCashAtClose >= 0);
  assert.equal(
    cents(closure.customerCardTotal),
    cents(closure.cardTotal) + cents(closure.cardFeeTotal)
  );

  const closureRead = await request(api.baseUrl, `/api/logistics/shifts/${shift.id}/closure`, authHeaders);
  assert.equal(closureRead.status, 200);
  assert.equal(closureRead.body.closure.id, closure.closureId);

  const reconciliationInput = {
    countedCash: Math.round((closure.expectedCashAtClose + 1) * 100) / 100,
    confirmedYape: Math.round((closure.yapeTotal + 0.5) * 100) / 100,
    confirmedCardCustomerTotal: Math.round((closure.customerCardTotal + 2) * 100) / 100,
    notes: "Diferencias controladas E2E",
  };
  const reconciliationResult = await request(
    api.baseUrl,
    `/api/logistics/shifts/${shift.id}/reconciliation`,
    { method: "POST", token, body: reconciliationInput }
  );
  assert.equal(reconciliationResult.status, 201);
  const reconciliation = reconciliationResult.body.reconciliation;
  assert.equal(reconciliation.cashDifference, 1);
  assert.equal(reconciliation.yapeDifference, 0.5);
  assert.equal(reconciliation.cardDifference, 2);
  assert.equal(
    cents(reconciliation.expectedCash),
    cents(reconciliation.openingCashSnapshot) +
      cents(reconciliation.cashSalesExpected) -
      cents(reconciliation.cashExpensesSnapshot)
  );

  const reconciliationRead = await request(
    api.baseUrl,
    `/api/logistics/shifts/${shift.id}/reconciliation`,
    authHeaders
  );
  assert.equal(reconciliationRead.status, 200);
  assert.equal(reconciliationRead.body.reconciliation.id, reconciliation.reconciliationId);

  const historyList = await request(
    api.baseUrl,
    "/api/logistics/history/shifts?page=1&pageSize=10",
    authHeaders
  );
  assert.equal(historyList.status, 200);
  assert.ok(historyList.body.items.some((item: any) => item.shiftId === shift.id));
  assert.equal(historyList.body.pagination.total, 1);

  const historyDetail = await request(
    api.baseUrl,
    `/api/logistics/history/shifts/${shift.id}`,
    authHeaders
  );
  assert.equal(historyDetail.status, 200);
  const history = historyDetail.body.history;
  assert.equal(history.shift.id, shift.id);
  assert.equal(history.closure.id, closure.closureId);
  assert.equal(history.reconciliation.id, reconciliation.reconciliationId);
  assert.ok(history.serviceSessions.length >= 6);

  const expectedOrderIds = [
  primaryOrder.id,
  cashOrder.id,
  yapeOrder.id,
  transferOrder.id,
];

assert.equal(history.orders.length, expectedOrderIds.length);

for (const orderId of expectedOrderIds) {
  assert.ok(
    history.orders.some((order: any) => order.id === orderId),
    `Expected historical order ${orderId} to be present`
  );
}

  assert.ok(history.orders.some((order: any) => order.items.some((item: any) => item.additions.length > 0)));
  assert.ok(history.orders.some((order: any) => order.items.some((item: any) => item.cancellation !== null)));
  assert.ok(history.transfers.serviceSessions.length >= 1);
  assert.ok(history.transfers.orderItems.length >= 2);
  assert.ok(history.payments.some((payment: any) => payment.method === "CASH"));
  assert.ok(history.payments.some((payment: any) => payment.method === "YAPE"));
  assert.ok(history.payments.some((payment: any) => payment.method === "CARD"));
  assert.equal(history.expenses.length, 2);
  assert.ok(history.expenses.some((expense: any) => expense.voidedAt !== null));
  assert.ok(history.audit.some((entry: any) => entry.action === "SHIFT_CLOSED"));
  assert.ok(history.audit.some((entry: any) => entry.action === "CASH_RECONCILED"));
});
