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
  paySessionWithToken,
  previewCheckout,
  request,
  startApi,
  type ApiBody,
  type ApiResult,
} from "./local-harness";

assertLocalEnvironment();

function cents(value: number) {
  return Math.round(value * 100);
}

function paymentSuccesses(results: ApiResult[]) {
  return results.filter((result) => result.status === 201);
}

function paymentFailures(results: ApiResult[]) {
  return results.filter((result) => result.status !== 201);
}

test("canonical checkout token and CHECKOUT_CHANGED invariants", { timeout: 180_000 }, async (t) => {
  const database = adminClient();
  const admin = await bootstrapProfile(database, { label: "checkout-changed" });
  const api = await startApi();
  t.after(() => api.close());

  const token = await login(api.baseUrl, admin.username);
  const fixture = await fixtures(database);
  await openShift(api.baseUrl, token, 100);

  let pointIndex = 0;
  async function newSession() {
    const point = fixture.points[pointIndex++];
    assert.ok(point, "checkout-changed suite exhausted the canonical service points");
    return openPoint(api.baseUrl, token, point.id);
  }

  async function awaitPayment(sessionId: string) {
    const result = await request(
      api.baseUrl,
      `/api/logistics/sessions/${sessionId}/await-payment`,
      { method: "POST", token, body: {} }
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }

  async function assertNoConfirmedPayment(sessionId: string, expectedStatus = "AWAITING_PAYMENT") {
    const [payments, session, audits] = await Promise.all([
      database.from("payments").select("id").eq("service_session_id", sessionId),
      database.from("service_sessions").select("status").eq("id", sessionId).single(),
      database
        .from("audit_logs")
        .select("id")
        .eq("service_session_id", sessionId)
        .eq("action", "PAYMENT_CONFIRMED"),
    ]);
    assert.ifError(payments.error);
    assert.ifError(session.error);
    assert.ifError(audits.error);
    assert.equal(payments.data.length, 0);
    assert.equal(session.data.status, expectedStatus);
    assert.equal(audits.data.length, 0);
  }

  async function assertCheckoutChanged(result: ApiResult) {
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.deepEqual(result.body.error, {
      code: "CHECKOUT_CHANGED",
      message: "La cuenta cambió. Actualiza el checkout antes de cobrar.",
    });
  }

  async function settleAwaiting(sessionId: string, method: "CASH" | "YAPE" | "CARD" = "CASH") {
    const current = await previewCheckout(api.baseUrl, token, sessionId);
    const result = await paySessionWithToken(
      api.baseUrl,
      token,
      sessionId,
      method,
      current.checkoutToken as string
    );
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.payment as ApiBody;
  }

  await t.test("A. token is deterministic without an economic change", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      {
        productId: fixture.kitchen.id,
        quantity: 2,
        additions: [{ productId: fixture.addition.id, quantityPerItem: 1 }],
      },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);

    const first = await previewCheckout(api.baseUrl, token, session.id);
    const second = await previewCheckout(api.baseUrl, token, session.id);
    assert.equal(first.checkoutToken, second.checkoutToken);
    assert.equal(first.businessAmount, second.businessAmount);
    assert.deepEqual(first.items, second.items);
    await paySession(api.baseUrl, token, session.id, "CASH");
  });

  await t.test("B/K. a new order invalidates the token and rolls payment back", async () => {
    const session = await newSession();
    const firstOrder = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, firstOrder.items[0].id);
    const stale = await previewCheckout(api.baseUrl, token, session.id);

    const secondOrder = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.drinks.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, secondOrder.items[0].id);
    await awaitPayment(session.id);

    const payment = await paySessionWithToken(
      api.baseUrl,
      token,
      session.id,
      "CASH",
      stale.checkoutToken as string
    );
    await assertCheckoutChanged(payment);
    await assertNoConfirmedPayment(session.id);
    await settleAwaiting(session.id);
  });

  await t.test("C. cancellation invalidates the token", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    const stale = await previewCheckout(api.baseUrl, token, session.id);

    const cancelled = await request(
      api.baseUrl,
      `/api/logistics/order-items/${order.items[0].id}/cancel`,
      { method: "POST", token, body: { reason: "Checkout stale por cancelación" } }
    );
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    await awaitPayment(session.id);

    const payment = await paySessionWithToken(
      api.baseUrl,
      token,
      session.id,
      "CASH",
      stale.checkoutToken as string
    );
    await assertCheckoutChanged(payment);
    await assertNoConfirmedPayment(session.id);
  });

  await t.test("D. transfer OUT invalidates the origin token", async () => {
    const origin = await newSession();
    const destination = await newSession();
    const order = await createOrder(api.baseUrl, token, origin.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    const stale = await previewCheckout(api.baseUrl, token, origin.id);

    const transfer = await request(
      api.baseUrl,
      `/api/logistics/order-items/${order.items[0].id}/transfer`,
      {
        method: "POST",
        token,
        body: { toSessionId: destination.id, quantity: 1, reason: "Checkout stale OUT" },
      }
    );
    assert.equal(transfer.status, 200, JSON.stringify(transfer.body));
    await awaitPayment(origin.id);

    const payment = await paySessionWithToken(
      api.baseUrl,
      token,
      origin.id,
      "CASH",
      stale.checkoutToken as string
    );
    await assertCheckoutChanged(payment);
    await assertNoConfirmedPayment(origin.id);
  });

  await t.test("E. transfer IN invalidates the destination token", async () => {
    const origin = await newSession();
    const destination = await newSession();
    const order = await createOrder(api.baseUrl, token, origin.id, [
      { productId: fixture.drinks.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    const stale = await previewCheckout(api.baseUrl, token, destination.id);

    const transfer = await request(
      api.baseUrl,
      `/api/logistics/order-items/${order.items[0].id}/transfer`,
      {
        method: "POST",
        token,
        body: { toSessionId: destination.id, quantity: 1, reason: "Checkout stale IN" },
      }
    );
    assert.equal(transfer.status, 200, JSON.stringify(transfer.body));
    await awaitPayment(destination.id);

    const payment = await paySessionWithToken(
      api.baseUrl,
      token,
      destination.id,
      "YAPE",
      stale.checkoutToken as string
    );
    await assertCheckoutChanged(payment);
    await assertNoConfirmedPayment(destination.id);
    await settleAwaiting(destination.id, "YAPE");
  });

  await t.test("F. preparation states do not invalidate the token", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    const itemId = order.items[0].id as string;
    const initial = await previewCheckout(api.baseUrl, token, session.id);

    for (const action of ["start", "ready", "deliver"]) {
      const transition = await request(
        api.baseUrl,
        `/api/logistics/order-items/${itemId}/${action}`,
        { method: "POST", token, body: {} }
      );
      assert.equal(transition.status, 200, JSON.stringify(transition.body));
      const current = await previewCheckout(api.baseUrl, token, session.id);
      assert.equal(current.checkoutToken, initial.checkoutToken);
      assert.equal(current.businessAmount, initial.businessAmount);
    }

    await awaitPayment(session.id);
    const payment = await paySessionWithToken(
      api.baseUrl,
      token,
      session.id,
      "CASH",
      initial.checkoutToken as string
    );
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
  });

  await t.test("G. CARD uses the current preview and exact five percent fee", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      {
        productId: fixture.kitchen.id,
        quantity: 1,
        additions: [{ productId: fixture.addition.id, quantityPerItem: 1 }],
      },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    const preview = await previewCheckout(api.baseUrl, token, session.id);
    const payment = await paySession(api.baseUrl, token, session.id, "CARD");

    assert.equal(cents(payment.businessAmount), cents(preview.businessAmount));
    assert.equal(payment.feeRate, 0.05);
    assert.equal(cents(payment.feeAmount), Math.round(cents(preview.businessAmount) * 0.05));
    assert.equal(
      cents(payment.customerTotal),
      cents(payment.businessAmount) + cents(payment.feeAmount)
    );
  });

  await t.test("H. equal totals with different composition produce different tokens", async () => {
    const session = await newSession();
    const [firstProduct, secondProduct] = fixture.samePriceProducts;
    assert.equal(firstProduct.price, secondProduct.price);
    assert.notEqual(firstProduct.id, secondProduct.id);

    const firstOrder = await createOrder(api.baseUrl, token, session.id, [
      { productId: firstProduct.id, quantity: 1 },
    ]);
    const first = await previewCheckout(api.baseUrl, token, session.id);
    const cancelled = await request(
      api.baseUrl,
      `/api/logistics/order-items/${firstOrder.items[0].id}/cancel`,
      { method: "POST", token, body: { reason: "Cambiar composición manteniendo total" } }
    );
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

    const secondOrder = await createOrder(api.baseUrl, token, session.id, [
      { productId: secondProduct.id, quantity: 1 },
    ]);
    const second = await previewCheckout(api.baseUrl, token, session.id);
    assert.equal(cents(first.businessAmount), cents(second.businessAmount));
    assert.notEqual(first.checkoutToken, second.checkoutToken);
    await deliverItem(api.baseUrl, token, secondOrder.items[0].id);
    await paySession(api.baseUrl, token, session.id, "CASH");
  });

  await t.test("I. a manipulated opaque token is rejected", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    await awaitPayment(session.id);

    const payment = await paySessionWithToken(
      api.baseUrl,
      token,
      session.id,
      "CASH",
      "syntactically-valid-but-wrong"
    );
    await assertCheckoutChanged(payment);
    await assertNoConfirmedPayment(session.id);
    await settleAwaiting(session.id);
  });

  await t.test("J. a missing token returns 400 before payment", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.drinks.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    await awaitPayment(session.id);

    const payment = await request(
      api.baseUrl,
      `/api/logistics/sessions/${session.id}/payments`,
      { method: "POST", token, body: { method: "CASH" } }
    );
    assert.equal(payment.status, 400, JSON.stringify(payment.body));
    await assertNoConfirmedPayment(session.id);
    await settleAwaiting(session.id);
  });

  await t.test("L. two payments with the same current token preserve PAYMENT_ALREADY_EXISTS", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, token, order.items[0].id);
    await awaitPayment(session.id);
    const preview = await previewCheckout(api.baseUrl, token, session.id);

    const results = await Promise.all([
      paySessionWithToken(api.baseUrl, token, session.id, "CASH", preview.checkoutToken as string),
      paySessionWithToken(api.baseUrl, token, session.id, "CASH", preview.checkoutToken as string),
    ]);
    assert.equal(paymentSuccesses(results).length, 1, JSON.stringify(results));
    assert.equal(paymentFailures(results).length, 1, JSON.stringify(results));
    assert.equal(paymentFailures(results)[0]!.status, 409);
    assert.equal(paymentFailures(results)[0]!.body.error?.code, "PAYMENT_ALREADY_EXISTS");

    const stored = await database.from("payments").select("id").eq("service_session_id", session.id);
    assert.ifError(stored.error);
    assert.equal(stored.data.length, 1);
  });

  await t.test("M. concurrent cancellation versus payment has one coherent winner", async () => {
    const session = await newSession();
    const order = await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    const itemId = order.items[0].id as string;
    await deliverItem(api.baseUrl, token, itemId);
    await awaitPayment(session.id);
    const preview = await previewCheckout(api.baseUrl, token, session.id);

    const [cancellation, payment] = await Promise.all([
      request(api.baseUrl, `/api/logistics/order-items/${itemId}/cancel`, {
        method: "POST",
        token,
        body: { reason: "Carrera real contra payment" },
      }),
      paySessionWithToken(
        api.baseUrl,
        token,
        session.id,
        "CASH",
        preview.checkoutToken as string
      ),
    ]);

    const [storedItem, storedSession, payments] = await Promise.all([
      database.from("order_items").select("status").eq("id", itemId).single(),
      database.from("service_sessions").select("status").eq("id", session.id).single(),
      database.from("payments").select("id, business_amount").eq("service_session_id", session.id),
    ]);
    assert.ifError(storedItem.error);
    assert.ifError(storedSession.error);
    assert.ifError(payments.error);

    if (payment.status === 201) {
      assert.equal(cancellation.status, 409, JSON.stringify(cancellation.body));
      assert.equal(cancellation.body.error?.code, "SERVICE_SESSION_NOT_ACTIVE");
      assert.equal(storedItem.data.status, "DELIVERED");
      assert.equal(storedSession.data.status, "PAID");
      assert.equal(payments.data.length, 1);
      assert.equal(cents(payments.data[0]!.business_amount), cents(preview.businessAmount));
    } else {
      assert.equal(cancellation.status, 200, JSON.stringify(cancellation.body));
      await assertCheckoutChanged(payment);
      assert.equal(storedItem.data.status, "CANCELLED");
      assert.equal(storedSession.data.status, "AWAITING_PAYMENT");
      assert.equal(payments.data.length, 0);
      await assertNoConfirmedPayment(session.id);
    }
  });

  await t.test("N. preview items, amount and token are one atomic before-or-after state", async () => {
    const session = await newSession();
    await createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    const before = await previewCheckout(api.baseUrl, token, session.id);

    const mutation = createOrder(api.baseUrl, token, session.id, [
      { productId: fixture.drinks.id, quantity: 1 },
    ]);
    const observationsPromise = Promise.all(
      Array.from({ length: 24 }, () => previewCheckout(api.baseUrl, token, session.id))
    );
    await mutation;
    const observations = await observationsPromise;
    const after = await previewCheckout(api.baseUrl, token, session.id);

    function snapshot(value: ApiBody) {
      const itemIds = value.items.map((item: ApiBody) => item.id).sort();
      return JSON.stringify({
        itemIds,
        businessAmount: value.businessAmount,
        checkoutToken: value.checkoutToken,
      });
    }

    const validStates = new Set([snapshot(before), snapshot(after)]);
    assert.notEqual(snapshot(before), snapshot(after));
    for (const observation of [before, ...observations, after]) {
      const lineTotal = observation.items.reduce(
        (sum: number, item: ApiBody) => sum + cents(item.lineTotal),
        0
      );
      assert.equal(lineTotal, cents(observation.businessAmount));
      assert.equal(validStates.has(snapshot(observation)), true, JSON.stringify(observation));
    }
  });
});
