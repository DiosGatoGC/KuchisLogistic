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
  paySession,
  previewCheckout,
  request,
  startApi,
  type ApiResult,
} from "./local-harness";

assertLocalEnvironment();

type RaceResult = ApiResult<Record<string, any>>;

function successes(results: RaceResult[]) {
  return results.filter((result) => result.status >= 200 && result.status < 300);
}

function failures(results: RaceResult[]) {
  return results.filter((result) => result.status < 200 || result.status >= 300);
}

function assertOneWinner(results: RaceResult[], successStatus: number, failureCode: string) {
  assert.equal(successes(results).length, 1, JSON.stringify(results));
  assert.equal(failures(results).length, 1, JSON.stringify(results));
  assert.equal(successes(results)[0]!.status, successStatus);
  assert.equal(failures(results)[0]!.status, 409);
  assert.equal(failures(results)[0]!.body.error?.code, failureCode);
}

function activeSessionQuery(database: ReturnType<typeof adminClient>, pointId: string) {
  return database
    .from("service_sessions")
    .select("id, shift_id, status")
    .eq("service_point_id", pointId)
    .in("status", ["OPEN", "AWAITING_PAYMENT"]);
}

test("real PostgreSQL concurrency invariants A-H", { timeout: 120_000 }, async (t) => {
  const database = adminClient();
  const [firstAdmin, secondAdmin] = await Promise.all([
    bootstrapProfile(database, { label: "concurrency-a" }),
    bootstrapProfile(database, { label: "concurrency-b" }),
  ]);
  const api = await startApi();
  t.after(() => api.close());

  const [firstToken, secondToken] = await Promise.all([
    login(api.baseUrl, firstAdmin.username),
    login(api.baseUrl, secondAdmin.username),
  ]);
  const fixture = await fixtures(database);

  let firstShiftId = "";

  await t.test("B. two simultaneous shift openings leave exactly one OPEN shift", async (scenario) => {
    const results = await Promise.all([
      request(api.baseUrl, "/api/logistics/shifts/open", {
        method: "POST",
        token: firstToken,
        body: { openingCash: 100 },
      }),
      request(api.baseUrl, "/api/logistics/shifts/open", {
        method: "POST",
        token: secondToken,
        body: { openingCash: 100 },
      }),
    ]);

    assertOneWinner(results, 201, "SHIFT_ALREADY_OPEN");
    firstShiftId = successes(results)[0]!.body.shift.id;

    const stored = await database.from("shifts").select("id, status").eq("status", "OPEN");
    assert.ifError(stored.error);
    assert.deepEqual(stored.data, [{ id: firstShiftId, status: "OPEN" }]);
    scenario.diagnostic(JSON.stringify({
      scenario: "B",
      http: results.map((result) => ({ status: result.status, code: result.body.error?.code ?? null })),
      database: { openShifts: stored.data.length, shiftId: firstShiftId, status: "OPEN" },
    }));
  });

  await t.test("A. two simultaneous openings of one service point create one active session", async (scenario) => {
    const pointId = fixture.points[0]!.id;
    const results = await Promise.all([
      request(api.baseUrl, `/api/logistics/service-points/${pointId}/open`, {
        method: "POST",
        token: firstToken,
        body: {},
      }),
      request(api.baseUrl, `/api/logistics/service-points/${pointId}/open`, {
        method: "POST",
        token: secondToken,
        body: {},
      }),
    ]);

    assertOneWinner(results, 201, "SERVICE_POINT_OCCUPIED");
    const sessionId = successes(results)[0]!.body.session.id;
    const stored = await activeSessionQuery(database, pointId);
    assert.ifError(stored.error);
    assert.deepEqual(stored.data, [{ id: sessionId, shift_id: firstShiftId, status: "OPEN" }]);
    scenario.diagnostic(JSON.stringify({
      scenario: "A",
      http: results.map((result) => ({ status: result.status, code: result.body.error?.code ?? null })),
      database: { activeSessions: stored.data.length, pointId, sessionId, status: "OPEN" },
    }));

    const released = await request(api.baseUrl, `/api/logistics/sessions/${sessionId}/release`, {
      method: "POST",
      token: firstToken,
      body: { reason: "Limpieza después de concurrencia A" },
    });
    assert.equal(released.status, 200);
  });

  await t.test("C. two simultaneous orders persist with different sequence numbers", async (scenario) => {
    const session = await openPoint(api.baseUrl, firstToken, fixture.points[1]!.id);
    const results = await Promise.all([
      request(api.baseUrl, `/api/logistics/sessions/${session.id}/orders`, {
        method: "POST",
        token: firstToken,
        body: { items: [{ productId: fixture.kitchen.id, quantity: 1 }] },
      }),
      request(api.baseUrl, `/api/logistics/sessions/${session.id}/orders`, {
        method: "POST",
        token: secondToken,
        body: { items: [{ productId: fixture.drinks.id, quantity: 1 }] },
      }),
    ]);

    assert.equal(successes(results).length, 2, JSON.stringify(results));
    assert.ok(results.every((result) => result.status === 201));

    const stored = await database
      .from("orders")
      .select("id, sequence_number, order_items(id)")
      .eq("service_session_id", session.id)
      .order("sequence_number");
    assert.ifError(stored.error);
    assert.deepEqual(stored.data?.map((order) => order.sequence_number), [1, 2]);
    assert.equal(new Set(stored.data?.map((order) => order.id)).size, 2);
    assert.equal(stored.data?.flatMap((order) => order.order_items).length, 2);
    const responseOrderIds = results.map((result) => result.body.order.id).sort();
    const storedOrderIds = stored.data.map((order) => order.id).sort();
    assert.deepEqual(storedOrderIds, responseOrderIds);
    scenario.diagnostic(JSON.stringify({
      scenario: "C",
      http: results.map((result) => ({ status: result.status, code: null })),
      database: {
        orders: stored.data.length,
        orderIds: storedOrderIds,
        sequenceNumbers: stored.data.map((order) => order.sequence_number),
        orderItems: stored.data.flatMap((order) => order.order_items).length,
      },
    }));

    await Promise.all(
      results.map((result) => deliverItem(api.baseUrl, firstToken, result.body.order.items[0].id))
    );
    await paySession(api.baseUrl, firstToken, session.id, "CASH");
  });

  await t.test("D. two simultaneous payments create exactly one payment", async (scenario) => {
    const session = await openPoint(api.baseUrl, firstToken, fixture.points[2]!.id);
    const order = await createOrder(api.baseUrl, firstToken, session.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    await deliverItem(api.baseUrl, firstToken, order.items[0].id);
    const awaiting = await request(api.baseUrl, `/api/logistics/sessions/${session.id}/await-payment`, {
      method: "POST",
      token: firstToken,
      body: {},
    });
    assert.equal(awaiting.status, 200);
    const preview = await previewCheckout(api.baseUrl, firstToken, session.id);

    const results = await Promise.all([
      request(api.baseUrl, `/api/logistics/sessions/${session.id}/payments`, {
        method: "POST",
        token: firstToken,
        body: { method: "CASH", expectedCheckoutToken: preview.checkoutToken },
      }),
      request(api.baseUrl, `/api/logistics/sessions/${session.id}/payments`, {
        method: "POST",
        token: secondToken,
        body: { method: "CASH", expectedCheckoutToken: preview.checkoutToken },
      }),
    ]);

    assertOneWinner(results, 201, "PAYMENT_ALREADY_EXISTS");
    const [payments, storedSession, audits] = await Promise.all([
      database
        .from("payments")
        .select("id, method, business_amount, fee_rate, fee_amount, customer_total")
        .eq("service_session_id", session.id),
      database.from("service_sessions").select("status").eq("id", session.id).single(),
      database
        .from("audit_logs")
        .select("id, entity_id")
        .eq("service_session_id", session.id)
        .eq("action", "PAYMENT_CONFIRMED"),
    ]);
    assert.ifError(payments.error);
    assert.ifError(storedSession.error);
    assert.ifError(audits.error);
    assert.equal(payments.data.length, 1);
    assert.equal(payments.data[0]!.method, "CASH");
    assert.equal(payments.data[0]!.business_amount, Number(fixture.kitchen.price));
    assert.equal(payments.data[0]!.fee_rate, 0);
    assert.equal(payments.data[0]!.fee_amount, 0);
    assert.equal(payments.data[0]!.customer_total, Number(fixture.kitchen.price));
    assert.equal(storedSession.data.status, "PAID");
    assert.equal(audits.data.length, 1);
    assert.equal(audits.data[0]!.entity_id, payments.data[0]!.id);
    scenario.diagnostic(JSON.stringify({
      scenario: "D",
      http: results.map((result) => ({ status: result.status, code: result.body.error?.code ?? null })),
      database: {
        payments: payments.data.length,
        paymentId: payments.data[0]!.id,
        businessAmount: payments.data[0]!.business_amount,
        feeAmount: payments.data[0]!.fee_amount,
        sessionStatus: storedSession.data.status,
        paymentAudits: audits.data.length,
      },
    }));
  });

  await t.test("E. item transfer racing payment preserves one coherent economic owner", async (scenario) => {
    const [origin, destination] = await Promise.all([
      openPoint(api.baseUrl, firstToken, fixture.points[3]!.id),
      openPoint(api.baseUrl, secondToken, fixture.points[4]!.id),
    ]);
    const order = await createOrder(api.baseUrl, firstToken, origin.id, [
      { productId: fixture.kitchen.id, quantity: 1 },
    ]);
    const itemId = order.items[0].id as string;
    await deliverItem(api.baseUrl, firstToken, itemId);
    const awaiting = await request(api.baseUrl, `/api/logistics/sessions/${origin.id}/await-payment`, {
      method: "POST",
      token: firstToken,
      body: {},
    });
    assert.equal(awaiting.status, 200);
    const preview = await previewCheckout(api.baseUrl, firstToken, origin.id);

    const [transfer, payment] = await Promise.all([
      request(api.baseUrl, `/api/logistics/order-items/${itemId}/transfer`, {
        method: "POST",
        token: firstToken,
        body: {
          toSessionId: destination.id,
          quantity: 1,
          reason: "Carrera transferencia contra pago",
        },
      }),
      request(api.baseUrl, `/api/logistics/sessions/${origin.id}/payments`, {
        method: "POST",
        token: secondToken,
        body: { method: "YAPE", expectedCheckoutToken: preview.checkoutToken },
      }),
    ]);

    assert.equal(successes([transfer, payment]).length, 1, JSON.stringify([transfer, payment]));
    assert.equal(failures([transfer, payment]).length, 1, JSON.stringify([transfer, payment]));

    const [storedItem, originPayments, destinationPayments, storedSessions, storedTransfers] =
      await Promise.all([
        database
          .from("order_items")
          .select("id, current_service_session_id, status, quantity, unit_price")
          .eq("id", itemId)
          .single(),
        database.from("payments").select("id, business_amount").eq("service_session_id", origin.id),
        database.from("payments").select("id, business_amount").eq("service_session_id", destination.id),
        database.from("service_sessions").select("id, status").in("id", [origin.id, destination.id]),
        database.from("order_item_transfers").select("id").eq("order_item_id", itemId),
      ]);
    assert.ifError(storedItem.error);
    assert.ifError(originPayments.error);
    assert.ifError(destinationPayments.error);
    assert.ifError(storedSessions.error);
    assert.ifError(storedTransfers.error);
    assert.equal(destinationPayments.data.length, 0);

    const sessionStatuses = new Map(storedSessions.data.map((session) => [session.id, session.status]));
    if (payment.status === 201) {
      assert.equal(transfer.status, 409);
      assert.equal(transfer.body.error?.code, "SERVICE_SESSION_NOT_ACTIVE");
      assert.equal(storedItem.data.current_service_session_id, origin.id);
      assert.equal(storedItem.data.status, "DELIVERED");
      assert.equal(originPayments.data.length, 1);
      assert.equal(originPayments.data[0]!.business_amount, Number(fixture.kitchen.price));
      assert.equal(sessionStatuses.get(origin.id), "PAID");
      assert.equal(storedTransfers.data.length, 0);

      const released = await request(api.baseUrl, `/api/logistics/sessions/${destination.id}/release`, {
        method: "POST",
        token: firstToken,
        body: { reason: "Destino vacío después de concurrencia E" },
      });
      assert.equal(released.status, 200);
      scenario.diagnostic(JSON.stringify({
        scenario: "E",
        serialization: "PAYMENT_WON",
        http: [
          { operation: "transfer", status: transfer.status, code: transfer.body.error?.code },
          { operation: "payment", status: payment.status, code: null },
        ],
        database: {
          itemId,
          economicOwner: storedItem.data.current_service_session_id,
          itemStatus: storedItem.data.status,
          originPayments: originPayments.data.length,
          destinationPayments: destinationPayments.data.length,
          transfers: storedTransfers.data.length,
        },
      }));
    } else {
      assert.equal(transfer.status, 200);
      assert.equal(payment.status, 409);
      assert.equal(payment.body.error?.code, "CHECKOUT_CHANGED");
      assert.equal(storedItem.data.current_service_session_id, destination.id);
      assert.equal(storedItem.data.status, "DELIVERED");
      assert.equal(originPayments.data.length, 0);
      assert.equal(sessionStatuses.get(origin.id), "AWAITING_PAYMENT");
      assert.equal(sessionStatuses.get(destination.id), "OPEN");
      assert.equal(storedTransfers.data.length, 1);

      const released = await request(api.baseUrl, `/api/logistics/sessions/${origin.id}/release`, {
        method: "POST",
        token: firstToken,
        body: { reason: "Origen vacío después de concurrencia E" },
      });
      assert.equal(released.status, 200);
      scenario.diagnostic(JSON.stringify({
        scenario: "E",
        serialization: "TRANSFER_WON",
        http: [
          { operation: "transfer", status: transfer.status, code: null },
          { operation: "payment", status: payment.status, code: payment.body.error?.code },
        ],
        database: {
          itemId,
          economicOwner: storedItem.data.current_service_session_id,
          itemStatus: storedItem.data.status,
          originPayments: originPayments.data.length,
          destinationPayments: destinationPayments.data.length,
          transfers: storedTransfers.data.length,
        },
      }));
      await paySession(api.baseUrl, firstToken, destination.id, "YAPE");
    }
  });

  await t.test("F. opening a session racing shift close never leaves CLOSED plus active", async (scenario) => {
    const pointId = fixture.points[5]!.id;
    const [opening, closing] = await Promise.all([
      request(api.baseUrl, `/api/logistics/service-points/${pointId}/open`, {
        method: "POST",
        token: firstToken,
        body: {},
      }),
      request(api.baseUrl, `/api/logistics/shifts/${firstShiftId}/close`, {
        method: "POST",
        token: secondToken,
        body: { closingNotes: "Carrera apertura contra cierre" },
      }),
    ]);

    assert.equal(successes([opening, closing]).length, 1, JSON.stringify([opening, closing]));
    const [storedShift, activeSessions, closures] = await Promise.all([
      database.from("shifts").select("status").eq("id", firstShiftId).single(),
      database
        .from("service_sessions")
        .select("id, status")
        .eq("shift_id", firstShiftId)
        .in("status", ["OPEN", "AWAITING_PAYMENT"]),
      database.from("shift_closures").select("id").eq("shift_id", firstShiftId),
    ]);
    assert.ifError(storedShift.error);
    assert.ifError(activeSessions.error);
    assert.ifError(closures.error);
    assert.equal(storedShift.data.status === "CLOSED" && activeSessions.data.length > 0, false);
    scenario.diagnostic(JSON.stringify({
      scenario: "F",
      http: [
        { operation: "open", status: opening.status, code: opening.body.error?.code ?? null },
        { operation: "close", status: closing.status, code: closing.body.error?.code ?? null },
      ],
      database: {
        shiftId: firstShiftId,
        shiftStatus: storedShift.data.status,
        activeSessions: activeSessions.data.length,
        closures: closures.data.length,
      },
    }));

    if (opening.status === 201) {
      assert.equal(closing.status, 409);
      assert.equal(closing.body.error?.code, "SHIFT_HAS_ACTIVE_SESSIONS");
      assert.equal(storedShift.data.status, "OPEN");
      assert.equal(activeSessions.data.length, 1);
      assert.equal(closures.data.length, 0);

      const released = await request(
        api.baseUrl,
        `/api/logistics/sessions/${opening.body.session.id}/release`,
        {
          method: "POST",
          token: firstToken,
          body: { reason: "Limpieza después de concurrencia F" },
        }
      );
      assert.equal(released.status, 200);
      const finalClose = await request(api.baseUrl, `/api/logistics/shifts/${firstShiftId}/close`, {
        method: "POST",
        token: firstToken,
        body: { closingNotes: "Cierre después de concurrencia F" },
      });
      assert.equal(finalClose.status, 201);
    } else {
      assert.equal(closing.status, 201);
      assert.equal(opening.status, 409);
      assert.equal(opening.body.error?.code, "SHIFT_NOT_OPEN");
      assert.equal(storedShift.data.status, "CLOSED");
      assert.equal(activeSessions.data.length, 0);
      assert.equal(closures.data.length, 1);
    }
  });

  let secondShiftId = "";

  await t.test("G. two simultaneous closes create exactly one closure", async (scenario) => {
    const opened = await request(api.baseUrl, "/api/logistics/shifts/open", {
      method: "POST",
      token: firstToken,
      body: { openingCash: 75 },
    });
    assert.equal(opened.status, 201);
    secondShiftId = opened.body.shift.id;

    const results = await Promise.all([
      request(api.baseUrl, `/api/logistics/shifts/${secondShiftId}/close`, {
        method: "POST",
        token: firstToken,
        body: { closingNotes: "Cierre concurrente G" },
      }),
      request(api.baseUrl, `/api/logistics/shifts/${secondShiftId}/close`, {
        method: "POST",
        token: secondToken,
        body: { closingNotes: "Cierre concurrente G" },
      }),
    ]);

    assertOneWinner(results, 201, "SHIFT_ALREADY_CLOSED");
    const [storedShift, closures, audits] = await Promise.all([
      database.from("shifts").select("status").eq("id", secondShiftId).single(),
      database.from("shift_closures").select("id").eq("shift_id", secondShiftId),
      database
        .from("audit_logs")
        .select("id, entity_id")
        .eq("shift_id", secondShiftId)
        .eq("action", "SHIFT_CLOSED"),
    ]);
    assert.ifError(storedShift.error);
    assert.ifError(closures.error);
    assert.ifError(audits.error);
    assert.equal(storedShift.data.status, "CLOSED");
    assert.equal(closures.data.length, 1);
    assert.equal(audits.data.length, 1);
    assert.equal(audits.data[0]!.entity_id, secondShiftId);
    scenario.diagnostic(JSON.stringify({
      scenario: "G",
      http: results.map((result) => ({ status: result.status, code: result.body.error?.code ?? null })),
      database: {
        shiftId: secondShiftId,
        shiftStatus: storedShift.data.status,
        closures: closures.data.length,
        closureId: closures.data[0]!.id,
        closeAudits: audits.data.length,
      },
    }));
  });

  await t.test("H. two simultaneous reconciliations create exactly one row", async (scenario) => {
    const input = {
      countedCash: 75,
      confirmedYape: 0,
      confirmedCardCustomerTotal: 0,
      notes: "Cuadre concurrente H",
    };
    const closureBefore = await database
      .from("shift_closures")
      .select("*")
      .eq("shift_id", secondShiftId)
      .single();
    assert.ifError(closureBefore.error);
    const results = await Promise.all([
      request(api.baseUrl, `/api/logistics/shifts/${secondShiftId}/reconciliation`, {
        method: "POST",
        token: firstToken,
        body: input,
      }),
      request(api.baseUrl, `/api/logistics/shifts/${secondShiftId}/reconciliation`, {
        method: "POST",
        token: secondToken,
        body: input,
      }),
    ]);

    assertOneWinner(results, 201, "CASH_RECONCILIATION_ALREADY_EXISTS");
    const [stored, closureAfter, audits] = await Promise.all([
      database
        .from("cash_reconciliations")
        .select("id, shift_id, expected_cash, counted_cash, cash_difference, confirmed_yape, yape_difference, confirmed_card_customer_total, card_difference")
        .eq("shift_id", secondShiftId),
      database.from("shift_closures").select("*").eq("shift_id", secondShiftId).single(),
      database
        .from("audit_logs")
        .select("id, entity_id")
        .eq("shift_id", secondShiftId)
        .eq("action", "CASH_RECONCILED"),
    ]);
    assert.ifError(stored.error);
    assert.ifError(closureAfter.error);
    assert.ifError(audits.error);
    assert.equal(stored.data.length, 1);
    assert.equal(stored.data[0]!.shift_id, secondShiftId);
    assert.equal(stored.data[0]!.counted_cash, input.countedCash);
    assert.equal(stored.data[0]!.confirmed_yape, input.confirmedYape);
    assert.equal(
      stored.data[0]!.confirmed_card_customer_total,
      input.confirmedCardCustomerTotal
    );
    assert.equal(stored.data[0]!.expected_cash, 75);
    assert.equal(stored.data[0]!.cash_difference, 0);
    assert.equal(stored.data[0]!.yape_difference, 0);
    assert.equal(stored.data[0]!.card_difference, 0);
    assert.deepEqual(closureAfter.data, closureBefore.data);
    assert.equal(audits.data.length, 1);
    assert.equal(audits.data[0]!.entity_id, stored.data[0]!.id);
    scenario.diagnostic(JSON.stringify({
      scenario: "H",
      http: results.map((result) => ({ status: result.status, code: result.body.error?.code ?? null })),
      database: {
        reconciliations: stored.data.length,
        reconciliationId: stored.data[0]!.id,
        expectedCash: stored.data[0]!.expected_cash,
        cashDifference: stored.data[0]!.cash_difference,
        yapeDifference: stored.data[0]!.yape_difference,
        cardDifference: stored.data[0]!.card_difference,
        reconciliationAudits: audits.data.length,
        closureUnchanged: true,
      },
    }));
  });
});
