import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";

import {
  connectionStatusAction,
  eventInvalidatesTopic,
  eventsForTopic,
} from "./logistics-realtime-model.ts";
import { createInvalidationCoordinator } from "./realtime-invalidation-coordinator.ts";

const base = { version: 1, occurredAt: "2026-09-10T15:00:00.000Z" };

describe("logistics realtime invalidations", () => {
  test("accepts every supported topic and event family", () => {
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.tables, { ...base, type: "TABLES_CHANGED", serviceSessionIds: [], servicePointIds: ["point-1"] }), true);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.tables, { ...base, type: "ORDERS_CHANGED", orderId: "order-1", serviceSessionIds: ["session-1"] }), true);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.kitchen, { ...base, type: "PREPARATION_CHANGED", station: "KITCHEN", orderId: "order-1", serviceSessionIds: [] }), true);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.drinks, { ...base, type: "PREPARATION_CHANGED", station: "DRINKS", orderId: "order-1", orderItemId: "item-1", serviceSessionIds: [] }), true);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.catalog, { ...base, type: "CATALOG_CHANGED", productId: "product-1" }), true);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.shift, { ...base, type: "SHIFT_CHANGED", shiftId: "shift-1" }), true);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.finance, { ...base, type: "FINANCE_CHANGED", scope: "PAYMENT", shiftId: "shift-1" }), true);
  });

  test("rejects unsupported versions, malformed payloads and wrong topic families", () => {
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.tables, { ...base, version: 2, type: "TABLES_CHANGED", serviceSessionIds: [], servicePointIds: [] }), false);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.tables, { ...base, type: "TABLES_CHANGED", serviceSessionIds: "session-1", servicePointIds: [] }), false);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.kitchen, { ...base, type: "PREPARATION_CHANGED", station: "DRINKS", orderId: "order-1", serviceSessionIds: [] }), false);
    assert.equal(eventInvalidatesTopic(LOGISTICS_REALTIME_TOPICS.catalog, { ...base, type: "ORDERS_CHANGED", orderId: "order-1", serviceSessionIds: [] }), false);
  });

  test("subscription and reconnection both request authoritative refresh", () => {
    assert.deepEqual(connectionStatusAction("SUBSCRIBED"), { state: "synchronized", refresh: true });
    assert.deepEqual(connectionStatusAction("CHANNEL_ERROR"), { state: "delayed", refresh: false });
    assert.deepEqual(connectionStatusAction("TIMED_OUT"), { state: "delayed", refresh: false });
  });

  test("binds only the event names owned by each topic", () => {
    assert.deepEqual(eventsForTopic(LOGISTICS_REALTIME_TOPICS.tables), ["TABLES_CHANGED", "ORDERS_CHANGED"]);
    assert.deepEqual(eventsForTopic(LOGISTICS_REALTIME_TOPICS.kitchen), ["PREPARATION_CHANGED"]);
    assert.deepEqual(eventsForTopic(LOGISTICS_REALTIME_TOPICS.finance), ["FINANCE_CHANGED"]);
  });

  test("coalesces bursts and cancels pending work on cleanup", async () => {
    const callbacks: Array<() => void> = [];
    let refreshes = 0;
    const coordinator = createInvalidationCoordinator(
      () => { refreshes += 1; },
      180,
      {
        setTimer: (callback) => {
          callbacks.push(callback);
          return callbacks.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => undefined,
      },
    );
    coordinator.schedule();
    coordinator.schedule();
    coordinator.schedule();
    assert.equal(callbacks.length, 1);
    callbacks[0]?.();
    await Promise.resolve();
    assert.equal(refreshes, 1);

    coordinator.schedule();
    coordinator.dispose();
    callbacks[1]?.();
    await Promise.resolve();
    assert.equal(refreshes, 1);
  });
});
