import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { operationalPreparationErrorMessage } from "./preparation-error-model.ts";
import {
  destinationStatus,
  formatElapsed,
  getPreparationAgeLevel,
  groupPreparationItems,
  itemsForStation,
  nextPreparationAction,
  preparationStationsForCapabilities,
  queueItemIdentity,
  reconcileTransition,
  runWithItemLock,
  stationPermissions,
} from "./preparation-model.ts";
import { executeTransitionAttempt } from "./preparation-transition.ts";
import type {
  PreparationQueueItem,
  PreparationStatus,
  TransitionResponse,
} from "./preparation-types.ts";

function queueItem(
  status: PreparationStatus = "PENDING",
  overrides: Partial<PreparationQueueItem> = {},
): PreparationQueueItem {
  return {
    orderItem: {
      id: `item-${status.toLowerCase()}`,
      productName: "Hamburguesa clásica",
      quantity: 2,
      notes: "Sin cebolla",
      status,
      preparationStation: "KITCHEN",
      preparingAt: status === "PENDING" ? null : "2026-09-03T10:03:00.000Z",
      readyAt: status === "READY" ? "2026-09-03T10:06:00.000Z" : null,
      deliveredAt: null,
    },
    additions: [
      { productId: "addition-1", additionName: "Queso", quantityPerItem: 1 },
    ],
    order: {
      id: "order-1",
      sequenceNumber: 12,
      sentAt: "2026-09-03T10:00:00.000Z",
    },
    session: { id: "session-1" },
    servicePoint: { id: "point-1", name: "Mesa 1" },
    ...overrides,
  };
}

function response(status: "PREPARING" | "READY" | "DELIVERED"): TransitionResponse {
  return {
    orderItem: {
      orderItemId: "item-pending",
      status,
      preparationStation: "KITCHEN",
      preparingAt: "2026-09-03T10:03:00.000Z",
      readyAt: status === "READY" || status === "DELIVERED"
        ? "2026-09-03T10:06:00.000Z"
        : null,
      deliveredAt: status === "DELIVERED" ? "2026-09-03T10:08:00.000Z" : null,
    },
  };
}

describe("preparation model", () => {
  test("groups the three operational statuses", () => {
    const groups = groupPreparationItems([
      queueItem("PENDING"),
      queueItem("PREPARING"),
      queueItem("READY"),
    ]);
    assert.equal(groups.PENDING.length, 1);
    assert.equal(groups.PREPARING.length, 1);
    assert.equal(groups.READY.length, 1);
  });

  test("preserves backend order inside a status group", () => {
    const first = queueItem("PENDING");
    const second = queueItem("PENDING", {
      orderItem: { ...first.orderItem, id: "item-second" },
    });
    assert.deepEqual(
      groupPreparationItems([first, second]).PENDING.map(({ orderItem }) => orderItem.id),
      ["item-pending", "item-second"],
    );
  });

  test("filters kitchen items without changing their order", () => {
    const kitchen = queueItem("PENDING");
    const drinks = queueItem("READY", {
      orderItem: {
        ...queueItem("READY").orderItem,
        id: "drink-1",
        preparationStation: "DRINKS",
      },
    });
    assert.deepEqual(itemsForStation([drinks, kitchen], "KITCHEN"), [kitchen]);
  });

  test("keeps additions exactly as provided by the queue", () => {
    assert.equal(queueItem().additions[0]?.additionName, "Queso");
    assert.equal(queueItem().additions[0]?.quantityPerItem, 1);
  });

  test("keeps operational notes", () => {
    assert.equal(queueItem().orderItem.notes, "Sin cebolla");
  });

  test("builds identity from service point and order sequence", () => {
    assert.equal(queueItemIdentity(queueItem()), "Mesa 1 · Comanda #12");
  });

  test("view-only kitchen permission cannot manage", () => {
    assert.deepEqual(stationPermissions(["orders.kitchen.view"], "KITCHEN"), {
      canView: true,
      canManage: false,
    });
  });

  test("view-only drinks permission cannot manage", () => {
    assert.deepEqual(stationPermissions(["orders.drinks.view"], "DRINKS"), {
      canView: true,
      canManage: false,
    });
  });

  test("kitchen manage permission enables its station", () => {
    assert.deepEqual(stationPermissions(["orders.kitchen.manage"], "KITCHEN"), {
      canView: true,
      canManage: true,
    });
  });

  test("drinks manage permission enables its station", () => {
    assert.deepEqual(stationPermissions(["orders.drinks.manage"], "DRINKS"), {
      canView: true,
      canManage: true,
    });
  });

  test("shows only stations represented by capabilities", () => {
    assert.deepEqual(
      preparationStationsForCapabilities(["orders.drinks.view"]),
      ["DRINKS"],
    );
    assert.deepEqual(
      preparationStationsForCapabilities([
        "orders.kitchen.view",
        "orders.drinks.manage",
      ]),
      ["KITCHEN", "DRINKS"],
    );
  });

  test("maps pending to start", () => {
    assert.equal(nextPreparationAction("PENDING"), "start");
  });

  test("maps preparing to ready", () => {
    assert.equal(nextPreparationAction("PREPARING"), "ready");
  });

  test("maps ready to deliver", () => {
    assert.equal(nextPreparationAction("READY"), "deliver");
  });

  test("maps each action to its destination", () => {
    assert.equal(destinationStatus("start"), "PREPARING");
    assert.equal(destinationStatus("ready"), "READY");
    assert.equal(destinationStatus("deliver"), "DELIVERED");
  });

  test("formats elapsed minutes, hours and future clock skew", () => {
    const sentAt = "2026-09-03T10:00:00.000Z";
    assert.equal(formatElapsed(sentAt, Date.parse("2026-09-03T10:00:20.000Z")), "Ahora");
    assert.equal(formatElapsed(sentAt, Date.parse("2026-09-03T10:07:00.000Z")), "hace 7 min");
    assert.equal(formatElapsed(sentAt, Date.parse("2026-09-03T12:00:00.000Z")), "hace 2 h");
    assert.equal(formatElapsed(sentAt, Date.parse("2026-09-03T09:00:00.000Z")), "Ahora");
  });

  test("returns explicit fallback for invalid sent time", () => {
    assert.equal(formatElapsed("not-a-date", 0), "Hora no disponible");
  });

  test("maps the exact age thresholds", () => {
    const sentAt = "2026-09-03T10:00:00.000Z";
    const at = (minutes: number, seconds = 0) =>
      Date.parse(sentAt) + minutes * 60_000 + seconds * 1_000;
    assert.equal(getPreparationAgeLevel(sentAt, at(9, 59)), "NORMAL");
    assert.equal(getPreparationAgeLevel(sentAt, at(10)), "WARNING");
    assert.equal(getPreparationAgeLevel(sentAt, at(14, 59)), "WARNING");
    assert.equal(getPreparationAgeLevel(sentAt, at(15)), "URGENT");
    assert.equal(getPreparationAgeLevel(sentAt, at(19, 59)), "URGENT");
    assert.equal(getPreparationAgeLevel(sentAt, at(20)), "CRITICAL");
    assert.equal(getPreparationAgeLevel(sentAt, at(25)), "CRITICAL");
  });

  test("uses the normal fallback for an invalid age date", () => {
    assert.equal(getPreparationAgeLevel("not-a-date", Date.now()), "NORMAL");
  });

  test("uses the same age logic for Kitchen and Drinks", () => {
    const sentAt = "2026-09-03T10:00:00.000Z";
    const nowMs = Date.parse("2026-09-03T10:15:00.000Z");
    const kitchen = queueItem("PENDING", { order: { ...queueItem().order, sentAt } });
    const drinks = queueItem("PENDING", {
      orderItem: { ...queueItem().orderItem, preparationStation: "DRINKS" },
      order: { ...queueItem().order, sentAt },
    });
    assert.equal(getPreparationAgeLevel(kitchen.order.sentAt, nowMs), "URGENT");
    assert.equal(getPreparationAgeLevel(drinks.order.sentAt, nowMs), "URGENT");
  });

  test("creates empty groups for an empty queue", () => {
    assert.deepEqual(groupPreparationItems([]), {
      PENDING: [],
      PREPARING: [],
      READY: [],
    });
  });

  test("reconciles a transition found at its destination", () => {
    assert.equal(
      reconcileTransition("item-pending", "start", [
        queueItem("PREPARING", {
          orderItem: { ...queueItem("PREPARING").orderItem, id: "item-pending" },
        }),
      ]),
      "applied",
    );
  });

  test("reconciles delivered when the item disappears", () => {
    assert.equal(reconcileTransition("item-ready", "deliver", []), "applied");
  });

  test("recognizes an unchanged origin after reconciliation", () => {
    assert.equal(reconcileTransition("item-pending", "start", [queueItem()]), "unchanged");
  });

  test("recognizes an unexpected concurrent state", () => {
    const changed = queueItem("READY", {
      orderItem: { ...queueItem("READY").orderItem, id: "item-pending" },
    });
    assert.equal(reconcileTransition("item-pending", "start", [changed]), "changed");
  });

  test("prevents two simultaneous operations for one item", async () => {
    const locks = new Set<string>();
    let release: (() => void) | undefined;
    const first = runWithItemLock(locks, "item-1", () =>
      new Promise<string>((resolve) => {
        release = () => resolve("done");
      }),
    );
    const second = await runWithItemLock(locks, "item-1", async () => "duplicate");
    assert.equal(second, undefined);
    release?.();
    assert.equal(await first, "done");
  });

  test("does not block a different item", async () => {
    const locks = new Set(["item-1"]);
    assert.equal(
      await runWithItemLock(locks, "item-2", async () => "independent"),
      "independent",
    );
  });

  test("successful mutation performs one authoritative refetch", async () => {
    let mutations = 0;
    let refetches = 0;
    const result = await executeTransitionAttempt({
      mutate: async () => { mutations += 1; return response("PREPARING"); },
      refetch: async () => { refetches += 1; return [queueItem("PREPARING")]; },
      classifyFailure: () => "other",
    });
    assert.equal(result.kind, "confirmed");
    assert.equal(mutations, 1);
    assert.equal(refetches, 1);
  });

  test("conflict never retries POST and refetches once", async () => {
    let mutations = 0;
    let refetches = 0;
    const result = await executeTransitionAttempt({
      mutate: async () => { mutations += 1; throw new Error("conflict"); },
      refetch: async () => { refetches += 1; return []; },
      classifyFailure: () => "conflict",
    });
    assert.equal(result.kind, "conflict");
    assert.equal(mutations, 1);
    assert.equal(refetches, 1);
  });

  test("ambiguous failure never retries POST and reconciles once", async () => {
    let mutations = 0;
    let refetches = 0;
    const result = await executeTransitionAttempt({
      mutate: async () => { mutations += 1; throw new Error("network"); },
      refetch: async () => { refetches += 1; return [queueItem()]; },
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "ambiguous");
    assert.equal(mutations, 1);
    assert.equal(refetches, 1);
  });

  test("ordinary failure is surfaced without a refetch", async () => {
    let refetches = 0;
    await assert.rejects(
      executeTransitionAttempt({
        mutate: async () => { throw new Error("forbidden"); },
        refetch: async () => { refetches += 1; return []; },
        classifyFailure: () => "other",
      }),
      /forbidden/,
    );
    assert.equal(refetches, 0);
  });

  test("reports a successful POST whose refresh failed", async () => {
    const result = await executeTransitionAttempt({
      mutate: async () => response("READY"),
      refetch: async () => { throw new Error("offline"); },
      classifyFailure: () => "other",
    });
    assert.equal(result.kind, "confirmed-refresh-failed");
  });

  test("reports a reconciliation that could not be fetched", async () => {
    const result = await executeTransitionAttempt({
      mutate: async () => { throw new Error("timeout"); },
      refetch: async () => { throw new Error("offline"); },
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "reconciliation-failed");
  });

  test("maps domain, permission, network and server errors safely", () => {
    assert.equal(
      operationalPreparationErrorMessage({
        kind: "conflict",
        code: "ORDER_ITEM_TRANSITION_INVALID",
      }),
      "Esa transición no corresponde al estado actual.",
    );
    assert.match(operationalPreparationErrorMessage({ kind: "forbidden" }), /permiso/);
    assert.match(operationalPreparationErrorMessage({ kind: "network" }), /conectar/);
    assert.match(operationalPreparationErrorMessage({ kind: "server" }), /temporal/);
  });
});
