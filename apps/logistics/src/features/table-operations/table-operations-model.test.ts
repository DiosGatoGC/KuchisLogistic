import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  OrderItem,
  SessionOrdersResult,
} from "../ordering/ordering-types.ts";
import type { ServicePointStatus } from "../tables/tables-types.ts";
import { operationalTableErrorMessage } from "./table-operations-error-model.ts";
import {
  eligibleItemTransferSessions,
  eligibleSessionTransferPoints,
  itemCanBeCorrected,
  reconcileCancellation,
  reconcileItemTransfer,
  reconcileSessionTransfer,
  runWithOperationLock,
  tableOperationPermissions,
  validateOptionalReason,
  validateRequiredReason,
  validateTransferQuantity,
} from "./table-operations-model.ts";
import { executeCorrectiveAttempt } from "./table-operations-mutation.ts";

function point(
  id: string,
  overrides: Partial<ServicePointStatus> = {},
): ServicePointStatus {
  return {
    id,
    name: `Mesa ${id}`,
    type: "TABLE",
    sortOrder: Number(id) || 1,
    isActive: true,
    isOccupied: false,
    activeSession: null,
    ...overrides,
  };
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "item-1",
    lineNumber: 1,
    productId: "product-1",
    productName: "Clásica",
    unitPrice: 12,
    quantity: 3,
    notes: null,
    preparationStation: "KITCHEN",
    status: "PENDING",
    currentServiceSessionId: "session-1",
    createdAt: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T10:00:00.000Z",
    preparingAt: null,
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelledFromStatus: null,
    cancellationReason: null,
    additions: [],
    ...overrides,
  };
}

function orders(orderItem: OrderItem = item()): SessionOrdersResult {
  return {
    session: {
      id: "session-1",
      status: "OPEN",
      servicePoint: { id: "1", name: "Mesa 1" },
    },
    orders: [
      {
        id: "order-1",
        sequenceNumber: 1,
        notes: null,
        sentAt: "2026-09-07T10:00:00.000Z",
        session: { id: "session-1" },
        servicePoint: { id: "1", name: "Mesa 1" },
        createdBy: {
          id: "user-1",
          fullName: "Operador",
          role: "MANAGER",
        },
        items: [orderItem],
      },
    ],
  };
}

describe("table operations model", () => {
  test("tables.view creates a real read-only permission set", () => {
    assert.deepEqual(tableOperationPermissions(["tables.view"]), {
      canView: true,
      canCancel: false,
      canTransfer: false,
    });
  });

  test("cancel and transfer capabilities are independent", () => {
    assert.deepEqual(
      tableOperationPermissions(["tables.view", "orders.cancel"]),
      { canView: true, canCancel: true, canTransfer: false },
    );
    assert.deepEqual(
      tableOperationPermissions(["tables.view", "orders.transfer"]),
      { canView: true, canCancel: false, canTransfer: true },
    );
  });

  test("session transfer includes only active free destinations", () => {
    const values = [
      point("1"),
      point("2"),
      point("3", { isActive: false }),
      point("4", {
        isOccupied: true,
        activeSession: { id: "session-4", status: "OPEN", openedAt: "now" },
      }),
    ];
    assert.deepEqual(
      eligibleSessionTransferPoints(values, "1").map(({ id }) => id),
      ["2"],
    );
  });

  test("item transfer includes only another active session", () => {
    const values = [
      point("1", {
        isOccupied: true,
        activeSession: { id: "session-1", status: "OPEN", openedAt: "now" },
      }),
      point("2", {
        isOccupied: true,
        activeSession: {
          id: "session-2",
          status: "AWAITING_PAYMENT",
          openedAt: "now",
        },
      }),
      point("3"),
    ];
    assert.deepEqual(
      eligibleItemTransferSessions(values, "session-1").map(({ id }) => id),
      ["2"],
    );
  });

  test("cancelled items expose no correction action", () => {
    assert.equal(itemCanBeCorrected(item()), true);
    assert.equal(itemCanBeCorrected(item({ status: "CANCELLED" })), false);
  });

  test("cancellation reason is required, trimmed and bounded", () => {
    assert.match(validateRequiredReason(" ").error ?? "", /motivo/i);
    assert.equal(validateRequiredReason(" Error de mesa ").reason, "Error de mesa");
    assert.match(validateRequiredReason("x".repeat(501)).error ?? "", /500/);
  });

  test("transfer reason is optional, trimmed and bounded", () => {
    assert.equal(validateOptionalReason(" ").reason, undefined);
    assert.equal(validateOptionalReason(" Cambio solicitado ").reason, "Cambio solicitado");
    assert.match(validateOptionalReason("x".repeat(501)).error ?? "", /500/);
  });

  test("transfer quantity accepts partial and full quantities", () => {
    assert.deepEqual(validateTransferQuantity("1", 3), { quantity: 1, error: null });
    assert.deepEqual(validateTransferQuantity("3", 3), { quantity: 3, error: null });
  });

  test("transfer quantity rejects invalid or excessive values", () => {
    assert.notEqual(validateTransferQuantity("0", 3).error, null);
    assert.notEqual(validateTransferQuantity("1.5", 3).error, null);
    assert.match(validateTransferQuantity("4", 3).error ?? "", /3/);
    assert.match(validateTransferQuantity("1001", 2000).error ?? "", /1000/);
  });

  test("cancellation reconciliation detects applied, unchanged and changed", () => {
    assert.equal(
      reconcileCancellation(orders(item({ status: "CANCELLED" })), "item-1", "PENDING"),
      "applied",
    );
    assert.equal(reconcileCancellation(orders(), "item-1", "PENDING"), "unchanged");
    assert.equal(
      reconcileCancellation(orders(item({ status: "READY" })), "item-1", "PENDING"),
      "changed",
    );
  });

  test("session transfer reconciliation detects applied, unchanged and changed", () => {
    const source = point("1", {
      isOccupied: true,
      activeSession: { id: "session-1", status: "OPEN", openedAt: "now" },
    });
    const destination = point("2");
    assert.equal(
      reconcileSessionTransfer(
        [point("1"), { ...destination, activeSession: source.activeSession }],
        "session-1",
        "1",
        "2",
      ),
      "applied",
    );
    assert.equal(
      reconcileSessionTransfer([source, destination], "session-1", "1", "2"),
      "unchanged",
    );
    assert.equal(
      reconcileSessionTransfer([point("1"), point("2")], "session-1", "1", "2"),
      "changed",
    );
  });

  test("item transfer reconciliation supports partial and full moves", () => {
    assert.equal(reconcileItemTransfer(orders(item({ quantity: 2 })), "item-1", 3, 1), "applied");
    assert.equal(
      reconcileItemTransfer({ ...orders(), orders: [] }, "item-1", 3, 3),
      "applied",
    );
  });

  test("item transfer reconciliation detects unchanged and concurrent change", () => {
    assert.equal(reconcileItemTransfer(orders(), "item-1", 3, 1), "unchanged");
    assert.equal(
      reconcileItemTransfer(orders(item({ quantity: 1 })), "item-1", 3, 1),
      "changed",
    );
  });

  test("operation lock prevents duplicate submit without blocking another key", async () => {
    const locks = new Set<string>();
    let release: (() => void) | undefined;
    const first = runWithOperationLock(
      locks,
      "cancel:item-1",
      () => new Promise<string>((resolve) => { release = () => resolve("done"); }),
    );
    assert.equal(
      await runWithOperationLock(locks, "cancel:item-1", async () => "duplicate"),
      undefined,
    );
    assert.equal(
      await runWithOperationLock(locks, "transfer:item-2", async () => "independent"),
      "independent",
    );
    release?.();
    assert.equal(await first, "done");
  });

  test("confirmed mutation performs exactly one authoritative refetch", async () => {
    let mutations = 0;
    let refetches = 0;
    const result = await executeCorrectiveAttempt({
      mutate: async () => { mutations += 1; return "ok"; },
      refetch: async () => { refetches += 1; return "fresh"; },
      classifyFailure: () => "other",
    });
    assert.equal(result.kind, "confirmed");
    assert.equal(mutations, 1);
    assert.equal(refetches, 1);
  });

  test("conflict reconciles once and never retries the mutation", async () => {
    let mutations = 0;
    let refetches = 0;
    const result = await executeCorrectiveAttempt({
      mutate: async () => { mutations += 1; throw new Error("conflict"); },
      refetch: async () => { refetches += 1; return "fresh"; },
      classifyFailure: () => "conflict",
    });
    assert.equal(result.kind, "conflict");
    assert.equal(mutations, 1);
    assert.equal(refetches, 1);
  });

  test("ambiguous write reconciles once and never retries the mutation", async () => {
    let mutations = 0;
    let refetches = 0;
    const result = await executeCorrectiveAttempt({
      mutate: async () => { mutations += 1; throw new Error("network"); },
      refetch: async () => { refetches += 1; return "fresh"; },
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "ambiguous");
    assert.equal(mutations, 1);
    assert.equal(refetches, 1);
  });

  test("ordinary error is surfaced without reconciliation", async () => {
    let refetches = 0;
    await assert.rejects(
      executeCorrectiveAttempt({
        mutate: async () => { throw new Error("forbidden"); },
        refetch: async () => { refetches += 1; return "fresh"; },
        classifyFailure: () => "other",
      }),
      /forbidden/,
    );
    assert.equal(refetches, 0);
  });

  test("maps correction domain conflicts to safe Spanish messages", () => {
    assert.match(
      operationalTableErrorMessage({
        kind: "conflict",
        code: "TRANSFER_QUANTITY_EXCEEDS_AVAILABLE",
      }),
      /cantidad/i,
    );
    assert.match(
      operationalTableErrorMessage({
        kind: "conflict",
        code: "SERVICE_POINT_OCCUPIED",
      }),
      /ocupado/i,
    );
  });

  test("maps network and permission fallbacks without raw errors", () => {
    assert.match(operationalTableErrorMessage({ kind: "network" }), /conectar/i);
    assert.match(operationalTableErrorMessage({ kind: "forbidden" }), /permiso/i);
  });
});
