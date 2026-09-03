import type { CreateOrderResult, Order } from "./ordering-types.ts";

interface ConfirmedOrderEffects {
  clearStoredDraft: () => void;
  clearMemoryDraft: () => void;
  prepareFeedback: (sequenceNumber: number) => void;
  replaceWithTables: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createdOrderFromResult(result: unknown): Order | null {
  if (!isRecord(result) || !isRecord(result.order)) return null;
  const order = result.order;
  if (
    typeof order.id !== "string" ||
    !order.id.trim() ||
    !Number.isInteger(order.sequenceNumber) ||
    Number(order.sequenceNumber) < 1 ||
    !Array.isArray(order.items) ||
    !isRecord(order.session) ||
    typeof order.session.id !== "string"
  ) {
    return null;
  }
  return order as unknown as Order;
}

export async function submitConfirmedOrder(
  create: () => Promise<CreateOrderResult>,
  effects: ConfirmedOrderEffects,
) {
  const result = await create();
  const order = createdOrderFromResult(result);
  if (!order) {
    throw new Error("Logistics no devolvió una comanda válida.");
  }

  effects.clearStoredDraft();
  effects.clearMemoryDraft();
  effects.prepareFeedback(order.sequenceNumber);
  effects.replaceWithTables();
  return order;
}
