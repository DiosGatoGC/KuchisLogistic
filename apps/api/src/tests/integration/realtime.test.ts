import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@kuchis/shared/database-types";
import {
  LOGISTICS_REALTIME_TOPICS,
  LOGISTICS_REALTIME_VERSION,
  type LogisticsRealtimeEvent,
  type LogisticsRealtimeTopic,
} from "@kuchis/shared/logistics-realtime";
import {
  adminClient,
  assertLocalEnvironment,
  bootstrapProfile,
  createOrder,
  fixtures,
  login,
  openPoint,
  openShift,
  publicClient,
  request,
  startApi,
  waitFor,
} from "./local-harness";

assertLocalEnvironment();

const SUBSCRIPTION_TIMEOUT_MS = 8_000;
const EVENT_TIMEOUT_MS = 8_000;
const QUIET_WINDOW_MS = 450;
const NO_EVENT_WINDOW_MS = 700;

type RealtimeClient = SupabaseClient<Database>;
type PrivateChannel = ReturnType<RealtimeClient["channel"]>;

type CapturedEvent = {
  topic: string;
  event: string;
  payload: LogisticsRealtimeEvent;
  transportMessageId: string | null;
  transportMetaMessageId: string | null;
  transportPayloadMessageId: string | null;
  transportMetadataLocation: "meta" | "payload" | "meta+payload" | "absent";
  receivedAt: string;
};

type SubscriptionObservation = {
  topic: string;
  statuses: Array<{ status: string; error: string | null }>;
};

type ExpectedEvent = {
  topic: LogisticsRealtimeTopic;
  event: LogisticsRealtimeEvent["type"];
  check?: (payload: LogisticsRealtimeEvent) => boolean;
  label?: string;
};

const expectedKeys: Record<LogisticsRealtimeEvent["type"], readonly string[]> = {
  TABLES_CHANGED: [
    "occurredAt",
    "servicePointIds",
    "serviceSessionIds",
    "type",
    "version",
  ],
  ORDERS_CHANGED: ["occurredAt", "orderId", "serviceSessionIds", "type", "version"],
  PREPARATION_CHANGED: [
    "occurredAt",
    "orderId",
    "serviceSessionIds",
    "station",
    "type",
    "version",
  ],
  CATALOG_CHANGED: ["occurredAt", "productId", "type", "version"],
  SHIFT_CHANGED: ["occurredAt", "shiftId", "type", "version"],
  FINANCE_CHANGED: ["occurredAt", "scope", "shiftId", "type", "version"],
};

const sensitiveKeys = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "auth_email",
  "email",
  "notes",
]);

const financeSensitiveKeys = new Set([
  "amount",
  "business_amount",
  "customer_total",
  "fee",
  "fee_amount",
  "method",
  "expected_cash",
  "counted_cash",
  "cash_difference",
  "description",
  "custom_category",
]);

function normalizeKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function inspectKeysRecursively(value: unknown, forbidden: Set<string>, path = "payload") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectKeysRecursively(entry, forbidden, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    assert.equal(
      forbidden.has(normalized),
      false,
      `Sensitive key ${path}.${key} appeared in a Realtime invalidation payload.`
    );
    inspectKeysRecursively(nested, forbidden, `${path}.${key}`);
  }
}

function payloadKeys(payload: LogisticsRealtimeEvent) {
  const keys = [...expectedKeys[payload.type]];
  if (payload.type === "PREPARATION_CHANGED" && payload.orderItemId !== undefined) {
    keys.push("orderItemId");
  }
  if (payload.type === "FINANCE_CHANGED" && payload.serviceSessionId !== undefined) {
    keys.push("serviceSessionId");
  }
  return keys.sort();
}

function assertMinimalPayload(captured: CapturedEvent) {
  const payload = captured.payload;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(
    captured.transportMessageId ?? "",
    uuidPattern,
    `Missing Supabase transport message UUID on ${captured.topic}.`
  );
  if (captured.transportMetaMessageId) {
    assert.match(captured.transportMetaMessageId, uuidPattern);
  }
  if (captured.transportPayloadMessageId) {
    assert.match(captured.transportPayloadMessageId, uuidPattern);
  }
  if (captured.transportMetaMessageId && captured.transportPayloadMessageId) {
    assert.equal(captured.transportMetaMessageId, captured.transportPayloadMessageId);
  }
  assert.ok(payload && typeof payload === "object", `Missing payload on ${captured.topic}.`);
  assert.equal(payload.version, LOGISTICS_REALTIME_VERSION);
  assert.equal(payload.type, captured.event);
  assert.ok(Number.isFinite(Date.parse(payload.occurredAt)), `Invalid occurredAt: ${payload.occurredAt}`);
  assert.deepEqual(Object.keys(payload).sort(), payloadKeys(payload));
  inspectKeysRecursively(payload, sensitiveKeys);
  if (payload.type === "FINANCE_CHANGED") {
    inspectKeysRecursively(payload, financeSensitiveKeys);
  }
}

function summarize(events: CapturedEvent[]) {
  return events.map(({ topic, event, payload }) => ({ topic, event, payload }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newPrivateChannel(
  client: RealtimeClient,
  topic: string,
  sink: CapturedEvent[]
): PrivateChannel {
  return client
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "*" }, (message) => {
      const rawPayload = message.payload as Record<string, unknown>;
      const metadataId = typeof message.meta?.id === "string" ? message.meta.id : null;
      const payloadId = typeof rawPayload.id === "string" ? rawPayload.id : null;
      const transportMessageId = metadataId ?? payloadId;
      const contractPayload = { ...rawPayload };
      if (payloadId) delete contractPayload.id;
      sink.push({
        topic,
        event: message.event,
        payload: contractPayload as unknown as LogisticsRealtimeEvent,
        transportMessageId,
        transportMetaMessageId: metadataId,
        transportPayloadMessageId: payloadId,
        transportMetadataLocation:
          metadataId && payloadId
            ? "meta+payload"
            : metadataId
              ? "meta"
              : payloadId
                ? "payload"
                : "absent",
        receivedAt: new Date().toISOString(),
      });
    });
}

async function subscribePrivate(
  client: RealtimeClient,
  topic: string,
  sink: CapturedEvent[]
) {
  const channel = newPrivateChannel(client, topic, sink);
  const observation: SubscriptionObservation = { topic, statuses: [] };
  const outcome = await new Promise<string>((resolveOutcome, rejectOutcome) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) rejectOutcome(new Error(`No terminal subscription state for ${topic}.`));
    }, SUBSCRIPTION_TIMEOUT_MS + 1_000);

    channel.subscribe((status, error) => {
      observation.statuses.push({ status, error: error?.message ?? null });
      if (settled) return;
      if (["SUBSCRIBED", "TIMED_OUT", "CLOSED", "CHANNEL_ERROR"].includes(status)) {
        settled = true;
        clearTimeout(timer);
        resolveOutcome(status);
      }
    }, SUBSCRIPTION_TIMEOUT_MS);
  });
  return { channel, observation, outcome };
}

async function authenticatedRealtimeClient(authEmail: string, password: string) {
  const client = publicClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  assert.ifError(error);
  assert.ok(data.session?.access_token, "Supabase Auth login did not return an access token.");
  await client.realtime.setAuth(data.session.access_token);
  return client;
}

function matchesExpected(actual: CapturedEvent, expected: ExpectedEvent) {
  return (
    actual.topic === expected.topic &&
    actual.event === expected.event &&
    (expected.check?.(actual.payload) ?? true)
  );
}

async function captureExact<T>(
  sink: CapturedEvent[],
  operation: () => Promise<T>,
  expected: ExpectedEvent[],
  label: string
) {
  const cursor = sink.length;
  const result = await operation();
  await waitFor(() => sink.length - cursor >= expected.length, EVENT_TIMEOUT_MS);
  await sleep(QUIET_WINDOW_MS);
  const actual = sink.slice(cursor);
  actual.forEach(assertMinimalPayload);
  assert.equal(
    actual.length,
    expected.length,
    `${label}: unexpected event cardinality. Received ${JSON.stringify(summarize(actual))}`
  );

  const unmatched = [...actual];
  for (const wanted of expected) {
    const index = unmatched.findIndex((entry) => matchesExpected(entry, wanted));
    assert.notEqual(
      index,
      -1,
      `${label}: missing ${wanted.label ?? `${wanted.topic}/${wanted.event}`}. Received ${JSON.stringify(summarize(actual))}`
    );
    unmatched.splice(index, 1);
  }
  assert.deepEqual(unmatched, [], `${label}: unmatched events remained.`);
  return { result, events: actual };
}

async function captureNone<T>(
  sink: CapturedEvent[],
  operation: () => Promise<T>,
  label: string
) {
  const cursor = sink.length;
  const result = await operation();
  await sleep(NO_EVENT_WINDOW_MS);
  const actual = sink.slice(cursor);
  assert.deepEqual(
    actual,
    [],
    `${label}: expected no event, received ${JSON.stringify(summarize(actual))}`
  );
  return result;
}

function expectedTables(sessionId: string, pointId: string): ExpectedEvent {
  return {
    topic: LOGISTICS_REALTIME_TOPICS.tables,
    event: "TABLES_CHANGED",
    check: (payload) =>
      payload.type === "TABLES_CHANGED" &&
      payload.serviceSessionIds.includes(sessionId) &&
      payload.servicePointIds.includes(pointId),
  };
}

function expectedOrders(orderId: string, sessionId: string): ExpectedEvent {
  return {
    topic: LOGISTICS_REALTIME_TOPICS.tables,
    event: "ORDERS_CHANGED",
    check: (payload) =>
      payload.type === "ORDERS_CHANGED" &&
      payload.orderId === orderId &&
      payload.serviceSessionIds.includes(sessionId),
  };
}

function expectedPreparation(
  station: "KITCHEN" | "DRINKS",
  orderId: string,
  sessionId: string,
  orderItemId?: string
): ExpectedEvent {
  return {
    topic:
      station === "KITCHEN"
        ? LOGISTICS_REALTIME_TOPICS.kitchen
        : LOGISTICS_REALTIME_TOPICS.drinks,
    event: "PREPARATION_CHANGED",
    check: (payload) =>
      payload.type === "PREPARATION_CHANGED" &&
      payload.station === station &&
      payload.orderId === orderId &&
      payload.serviceSessionIds.includes(sessionId) &&
      payload.orderItemId === orderItemId,
  };
}

function expectedCatalog(productId: string): ExpectedEvent {
  return {
    topic: LOGISTICS_REALTIME_TOPICS.catalog,
    event: "CATALOG_CHANGED",
    check: (payload) => payload.type === "CATALOG_CHANGED" && payload.productId === productId,
  };
}

function expectedShift(shiftId: string): ExpectedEvent {
  return {
    topic: LOGISTICS_REALTIME_TOPICS.shift,
    event: "SHIFT_CHANGED",
    check: (payload) => payload.type === "SHIFT_CHANGED" && payload.shiftId === shiftId,
  };
}

function expectedFinance(
  scope: "PAYMENT" | "EXPENSE" | "CLOSURE" | "RECONCILIATION",
  shiftId: string,
  serviceSessionId?: string
): ExpectedEvent {
  return {
    topic: LOGISTICS_REALTIME_TOPICS.finance,
    event: "FINANCE_CHANGED",
    check: (payload) =>
      payload.type === "FINANCE_CHANGED" &&
      payload.scope === scope &&
      payload.shiftId === shiftId &&
      payload.serviceSessionId === serviceSessionId,
  };
}

async function setAvailability(
  baseUrl: string,
  token: string,
  productId: string,
  isAvailable: boolean
) {
  const result = await request(baseUrl, `/api/logistics/catalog/products/${productId}/availability`, {
    method: "PATCH",
    token,
    body: { isAvailable },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result;
}

async function releaseSession(baseUrl: string, token: string, sessionId: string, reason: string) {
  const result = await request(baseUrl, `/api/logistics/sessions/${sessionId}/release`, {
    method: "POST",
    token,
    body: { reason },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result;
}

test("real private Supabase Realtime logistics contract", { timeout: 180_000 }, async (t) => {
  const database = adminClient();
  const api = await startApi();
  const clients: RealtimeClient[] = [];
  t.after(async () => {
    await Promise.allSettled(clients.map((client) => client.removeAllChannels()));
    await api.close();
  });

  const activeProfile = await bootstrapProfile(database, { label: "realtime-active" });
  const inactiveProfile = await bootstrapProfile(database, { label: "realtime-inactive" });
  const activeToken = await login(api.baseUrl, activeProfile.username);
  await login(api.baseUrl, inactiveProfile.username);

  const activeClient = await authenticatedRealtimeClient(
    activeProfile.authEmail,
    activeProfile.password
  );
  const anonymousClient = publicClient();
  const inactiveClient = await authenticatedRealtimeClient(
    inactiveProfile.authEmail,
    inactiveProfile.password
  );
  const invalidTopicClient = await authenticatedRealtimeClient(
    activeProfile.authEmail,
    activeProfile.password
  );
  clients.push(activeClient, anonymousClient, inactiveClient, invalidTopicClient);

  const inactiveUpdate = await database
    .from("profiles")
    .update({ is_active: false })
    .eq("id", inactiveProfile.id);
  assert.ifError(inactiveUpdate.error);

  const activeEvents: CapturedEvent[] = [];
  const activeSubscriptions = await Promise.all(
    Object.values(LOGISTICS_REALTIME_TOPICS).map((topic) =>
      subscribePrivate(activeClient, topic, activeEvents)
    )
  );
  for (const subscription of activeSubscriptions) {
    assert.equal(
      subscription.outcome,
      "SUBSCRIBED",
      `Active client failed ${subscription.observation.topic}: ${JSON.stringify(subscription.observation)}`
    );
  }

  const anonymousEvents: CapturedEvent[] = [];
  const inactiveEvents: CapturedEvent[] = [];
  const invalidTopicEvents: CapturedEvent[] = [];
  const [anonymousSubscription, inactiveSubscription, invalidTopicSubscription] = await Promise.all([
    subscribePrivate(anonymousClient, LOGISTICS_REALTIME_TOPICS.tables, anonymousEvents),
    subscribePrivate(inactiveClient, LOGISTICS_REALTIME_TOPICS.tables, inactiveEvents),
    subscribePrivate(invalidTopicClient, "logistics:v1:not-a-real-topic", invalidTopicEvents),
  ]);
  for (const denied of [anonymousSubscription, inactiveSubscription, invalidTopicSubscription]) {
    assert.notEqual(
      denied.outcome,
      "SUBSCRIBED",
      `Private subscription unexpectedly authorized: ${JSON.stringify(denied.observation)}`
    );
  }

  console.log(
    `[realtime] subscription observations ${JSON.stringify({
      active: activeSubscriptions.map(({ observation }) => observation),
      anonymous: anonymousSubscription.observation,
      inactive: inactiveSubscription.observation,
      invalidTopic: invalidTopicSubscription.observation,
    })}`
  );

  const fixture = await fixtures(database);

  let shiftId = "";
  const openedShift = await captureExact(
    activeEvents,
    async () => {
      const shift = await openShift(api.baseUrl, activeToken, 100);
      shiftId = shift.id;
      return shift;
    },
    [
      {
        topic: LOGISTICS_REALTIME_TOPICS.shift,
        event: "SHIFT_CHANGED",
        check: (payload) => payload.type === "SHIFT_CHANGED" && payload.shiftId === shiftId,
      },
    ],
    "open shift"
  );
  assert.equal(openedShift.result.id, shiftId);

  let primarySessionId = "";
  const openedPrimary = await captureExact(
    activeEvents,
    async () => {
      const session = await openPoint(api.baseUrl, activeToken, fixture.points[0]!.id);
      primarySessionId = session.id;
      return session;
    },
    [
      {
        topic: LOGISTICS_REALTIME_TOPICS.tables,
        event: "TABLES_CHANGED",
        check: (payload) =>
          payload.type === "TABLES_CHANGED" &&
          payload.serviceSessionIds.includes(primarySessionId) &&
          payload.servicePointIds.includes(fixture.points[0]!.id),
      },
    ],
    "open service session"
  );
  assert.equal(openedPrimary.result.id, primarySessionId);

  await sleep(NO_EVENT_WINDOW_MS);
  assert.deepEqual(anonymousEvents, [], "Anonymous client received a private tables broadcast.");
  assert.deepEqual(inactiveEvents, [], "Inactive profile received a private tables broadcast.");
  assert.deepEqual(invalidTopicEvents, [], "Unknown topic received a private broadcast.");
  await Promise.all([
    anonymousClient.removeChannel(anonymousSubscription.channel),
    inactiveClient.removeChannel(inactiveSubscription.channel),
    invalidTopicClient.removeChannel(invalidTopicSubscription.channel),
  ]);

  const storedSession = await database
    .from("service_sessions")
    .select("id, status, service_point_id")
    .eq("id", primarySessionId)
    .single();
  assert.ifError(storedSession.error);
  assert.equal(storedSession.data.status, "OPEN");

  let primaryOrder: any;
  await captureExact(
    activeEvents,
    async () => {
      primaryOrder = await createOrder(api.baseUrl, activeToken, primarySessionId, [
        { productId: fixture.kitchen.id, quantity: 1 },
        { productId: fixture.drinks.id, quantity: 1 },
      ]);
      return primaryOrder;
    },
    [
      {
        topic: LOGISTICS_REALTIME_TOPICS.tables,
        event: "ORDERS_CHANGED",
        check: (payload) =>
          payload.type === "ORDERS_CHANGED" &&
          payload.orderId === primaryOrder?.id &&
          payload.serviceSessionIds.includes(primarySessionId),
      },
      {
        topic: LOGISTICS_REALTIME_TOPICS.kitchen,
        event: "PREPARATION_CHANGED",
        check: (payload) =>
          payload.type === "PREPARATION_CHANGED" &&
          payload.station === "KITCHEN" &&
          payload.orderId === primaryOrder?.id &&
          payload.orderItemId === undefined,
      },
      {
        topic: LOGISTICS_REALTIME_TOPICS.drinks,
        event: "PREPARATION_CHANGED",
        check: (payload) =>
          payload.type === "PREPARATION_CHANGED" &&
          payload.station === "DRINKS" &&
          payload.orderId === primaryOrder?.id &&
          payload.orderItemId === undefined,
      },
    ],
    "create mixed-station order"
  );

  const storedOrder = await database
    .from("orders")
    .select("id, service_session_id")
    .eq("id", primaryOrder.id)
    .single();
  const storedItems = await database
    .from("order_items")
    .select("id, preparation_station, status")
    .eq("order_id", primaryOrder.id);
  assert.ifError(storedOrder.error);
  assert.ifError(storedItems.error);
  assert.equal(storedItems.data.length, 2);

  const kitchenItem = primaryOrder.items.find((item: any) => item.preparationStation === "KITCHEN");
  const drinksItem = primaryOrder.items.find((item: any) => item.preparationStation === "DRINKS");
  assert.ok(kitchenItem);
  assert.ok(drinksItem);

  for (const [item, station] of [
    [kitchenItem, "KITCHEN"],
    [drinksItem, "DRINKS"],
  ] as const) {
    for (const action of ["start", "ready", "deliver"] as const) {
      await captureExact(
        activeEvents,
        async () => {
          const response = await request(
            api.baseUrl,
            `/api/logistics/order-items/${item.id}/${action}`,
            { method: "POST", token: activeToken, body: {} }
          );
          assert.equal(response.status, 200, JSON.stringify(response.body));
          return response;
        },
        [
          expectedOrders(primaryOrder.id, primarySessionId),
          expectedPreparation(station, primaryOrder.id, primarySessionId, item.id),
        ],
        `${station} item ${action}`
      );
    }
  }

  await captureExact(
    activeEvents,
    () => setAvailability(api.baseUrl, activeToken, fixture.kitchen.id, false),
    [expectedCatalog(fixture.kitchen.id)],
    "catalog unavailable"
  );
  const unavailableProduct = await database
    .from("products")
    .select("is_available")
    .eq("id", fixture.kitchen.id)
    .single();
  assert.ifError(unavailableProduct.error);
  assert.equal(unavailableProduct.data.is_available, false);
  await captureExact(
    activeEvents,
    () => setAvailability(api.baseUrl, activeToken, fixture.kitchen.id, true),
    [expectedCatalog(fixture.kitchen.id)],
    "catalog restore"
  );

  const createdExpense = await captureExact(
    activeEvents,
    async () => {
      const response = await request(api.baseUrl, "/api/logistics/expenses", {
        method: "POST",
        token: activeToken,
        body: { category: "SUPPLIES", description: "Realtime local", amount: 8.5 },
      });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return response;
    },
    [expectedFinance("EXPENSE", shiftId)],
    "expense create"
  );
  const expenseId = createdExpense.result.body.expense.id as string;
  await captureExact(
    activeEvents,
    async () => {
      const response = await request(api.baseUrl, `/api/logistics/expenses/${expenseId}/void`, {
        method: "POST",
        token: activeToken,
        body: { reason: "Realtime rollback cleanup" },
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response;
    },
    [expectedFinance("EXPENSE", shiftId)],
    "expense void"
  );

  await captureExact(
    activeEvents,
    async () => {
      const response = await request(
        api.baseUrl,
        `/api/logistics/sessions/${primarySessionId}/await-payment`,
        { method: "POST", token: activeToken, body: {} }
      );
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response;
    },
    [expectedTables(primarySessionId, fixture.points[0]!.id)],
    "await payment"
  );

  const paymentResult = await captureExact(
    activeEvents,
    async () => {
      const response = await request(
        api.baseUrl,
        `/api/logistics/sessions/${primarySessionId}/payments`,
        { method: "POST", token: activeToken, body: { method: "CASH" } }
      );
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return response;
    },
    [
      expectedTables(primarySessionId, fixture.points[0]!.id),
      expectedFinance("PAYMENT", shiftId, primarySessionId),
    ],
    "payment"
  );
  const paymentId = paymentResult.result.body.payment.paymentId as string;
  const storedPayment = await database
    .from("payments")
    .select("id, service_session_id")
    .eq("id", paymentId)
    .single();
  assert.ifError(storedPayment.error);
  assert.equal(storedPayment.data.service_session_id, primarySessionId);

  let rollbackSessionId = "";
  await captureExact(
    activeEvents,
    async () => {
      const session = await openPoint(api.baseUrl, activeToken, fixture.points[1]!.id);
      rollbackSessionId = session.id;
      return session;
    },
    [
      {
        topic: LOGISTICS_REALTIME_TOPICS.tables,
        event: "TABLES_CHANGED",
        check: (payload) =>
          payload.type === "TABLES_CHANGED" &&
          payload.serviceSessionIds.includes(rollbackSessionId) &&
          payload.servicePointIds.includes(fixture.points[1]!.id),
      },
    ],
    "open rollback session"
  );
  await captureExact(
    activeEvents,
    () => setAvailability(api.baseUrl, activeToken, fixture.drinks.id, false),
    [expectedCatalog(fixture.drinks.id)],
    "make rollback product unavailable"
  );

  const ordersBeforeRollback = await database
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("service_session_id", rollbackSessionId);
  assert.ifError(ordersBeforeRollback.error);
  const failedOrder = await captureNone(
    activeEvents,
    () =>
      request(api.baseUrl, `/api/logistics/sessions/${rollbackSessionId}/orders`, {
        method: "POST",
        token: activeToken,
        body: {
          items: [
            { productId: fixture.kitchen.id, quantity: 1 },
            { productId: fixture.drinks.id, quantity: 1 },
          ],
        },
      }),
    "rolled-back order"
  );
  assert.equal(failedOrder.status, 409, JSON.stringify(failedOrder.body));
  assert.equal(failedOrder.body.error?.code, "PRODUCT_UNAVAILABLE");

  const ordersAfterRollback = await database
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("service_session_id", rollbackSessionId);
  const orphanRollbackItems = await database
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("current_service_session_id", rollbackSessionId);
  assert.ifError(ordersAfterRollback.error);
  assert.ifError(orphanRollbackItems.error);
  assert.equal(ordersAfterRollback.count, ordersBeforeRollback.count);
  assert.equal(orphanRollbackItems.count, 0);

  await captureExact(
    activeEvents,
    () => setAvailability(api.baseUrl, activeToken, fixture.drinks.id, true),
    [expectedCatalog(fixture.drinks.id)],
    "restore rollback product"
  );
  await captureExact(
    activeEvents,
    () =>
      releaseSession(
        api.baseUrl,
        activeToken,
        rollbackSessionId,
        "Sesión local de rollback sin consumo"
      ),
    [expectedTables(rollbackSessionId, fixture.points[1]!.id)],
    "release rollback session"
  );

  const reconnectClient = await authenticatedRealtimeClient(
    activeProfile.authEmail,
    activeProfile.password
  );
  clients.push(reconnectClient);
  const beforeDisconnectEvents: CapturedEvent[] = [];
  const beforeDisconnect = await subscribePrivate(
    reconnectClient,
    LOGISTICS_REALTIME_TOPICS.tables,
    beforeDisconnectEvents
  );
  assert.equal(beforeDisconnect.outcome, "SUBSCRIBED");
  await reconnectClient.removeChannel(beforeDisconnect.channel);

  let reconnectSessionId = "";
  await captureExact(
    activeEvents,
    async () => {
      const session = await openPoint(api.baseUrl, activeToken, fixture.points[2]!.id);
      reconnectSessionId = session.id;
      return session;
    },
    [
      {
        topic: LOGISTICS_REALTIME_TOPICS.tables,
        event: "TABLES_CHANGED",
        check: (payload) =>
          payload.type === "TABLES_CHANGED" &&
          payload.serviceSessionIds.includes(reconnectSessionId) &&
          payload.servicePointIds.includes(fixture.points[2]!.id),
      },
    ],
    "change while reconnect client is disconnected"
  );
  assert.deepEqual(beforeDisconnectEvents, []);

  const afterReconnectEvents: CapturedEvent[] = [];
  const afterReconnect = await subscribePrivate(
    reconnectClient,
    LOGISTICS_REALTIME_TOPICS.tables,
    afterReconnectEvents
  );
  assert.equal(afterReconnect.outcome, "SUBSCRIBED");
  await sleep(NO_EVENT_WINDOW_MS);
  assert.deepEqual(afterReconnectEvents, [], "Reconnect unexpectedly replayed a historical broadcast.");

  const currentTables = await request(api.baseUrl, "/api/logistics/service-points/status", {
    token: activeToken,
  });
  assert.equal(currentTables.status, 200, JSON.stringify(currentTables.body));
  const reconnectedPoint = currentTables.body.servicePoints.find(
    (point: any) => point.id === fixture.points[2]!.id
  );
  assert.equal(reconnectedPoint?.activeSession?.id, reconnectSessionId);
  assert.equal(reconnectedPoint?.isOccupied, true);
  await reconnectClient.removeChannel(afterReconnect.channel);

  await captureExact(
    activeEvents,
    () =>
      releaseSession(
        api.baseUrl,
        activeToken,
        reconnectSessionId,
        "Sesión local para validar refetch tras reconnect"
      ),
    [expectedTables(reconnectSessionId, fixture.points[2]!.id)],
    "release reconnect session"
  );

  const closeResult = await captureExact(
    activeEvents,
    async () => {
      const response = await request(api.baseUrl, `/api/logistics/shifts/${shiftId}/close`, {
        method: "POST",
        token: activeToken,
        body: { closingNotes: "Cierre local Realtime" },
      });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return response;
    },
    [expectedShift(shiftId), expectedFinance("CLOSURE", shiftId)],
    "shift closure"
  );
  const closure = closeResult.result.body.closure;
  assert.equal(closure.shiftStatus, "CLOSED");

  const reconciliationResult = await captureExact(
    activeEvents,
    async () => {
      const response = await request(
        api.baseUrl,
        `/api/logistics/shifts/${shiftId}/reconciliation`,
        {
          method: "POST",
          token: activeToken,
          body: {
            countedCash: closure.expectedCashAtClose,
            confirmedYape: closure.yapeTotal,
            confirmedCardCustomerTotal: closure.customerCardTotal,
            notes: "Refetch REST conserva el detalle",
          },
        }
      );
      assert.equal(response.status, 201, JSON.stringify(response.body));
      return response;
    },
    [expectedFinance("RECONCILIATION", shiftId)],
    "cash reconciliation"
  );
  const reconciliationId = reconciliationResult.result.body.reconciliation
    .reconciliationId as string;
  const storedReconciliation = await database
    .from("cash_reconciliations")
    .select("id, shift_id")
    .eq("id", reconciliationId)
    .single();
  assert.ifError(storedReconciliation.error);
  assert.equal(storedReconciliation.data.shift_id, shiftId);

  console.log(
    `[realtime] verified ${activeEvents.length} broadcasts ${JSON.stringify(
      activeEvents.reduce<Record<string, number>>((counts, entry) => {
        const key = `${entry.topic}/${entry.event}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {})
    )}`
  );
});
