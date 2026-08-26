import type { Json } from "@kuchis/shared/database-types";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ordersRepository, type OrdersRepository } from "./orders.repository";
import type { CreateOrderInput } from "./orders.schemas";
import type { AdditionRow, OrderAggregate, OrderItemRow } from "./orders.types";

function rpcObject(value: Json, code: string): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(500, code, "La operación terminó con una respuesta inválida.");
  }
  return value;
}

function publicAddition(addition: AdditionRow) {
  return {
    productId: addition.product_id,
    additionName: addition.addition_name,
    unitPrice: addition.unit_price,
    quantityPerItem: addition.quantity_per_item,
  };
}

function publicItem(item: OrderItemRow, additions: AdditionRow[]) {
  return {
    id: item.id,
    lineNumber: item.line_number,
    productId: item.product_id,
    productName: item.product_name,
    unitPrice: item.unit_price,
    quantity: item.quantity,
    notes: item.notes,
    preparationStation: item.preparation_station,
    status: item.status,
    currentServiceSessionId: item.current_service_session_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    preparingAt: item.preparing_at,
    readyAt: item.ready_at,
    deliveredAt: item.delivered_at,
    cancelledAt: item.cancelled_at,
    cancelledFromStatus: item.cancelled_from_status,
    cancellationReason: item.cancellation_reason,
    additions: additions.map(publicAddition),
  };
}

export function publicOrder(aggregate: OrderAggregate) {
  const { order, originalSession, servicePoint, creator } = aggregate;
  return {
    id: order.id,
    sequenceNumber: order.sequence_number,
    notes: order.notes,
    sentAt: order.sent_at,
    session: { id: originalSession.id },
    servicePoint: { id: servicePoint.id, name: servicePoint.name },
    createdBy: { id: creator.id, fullName: creator.full_name, role: order.created_by_role },
    items: aggregate.items.map(({ item, additions }) => publicItem(item, additions)),
  };
}

export class OrdersService {
  constructor(private readonly orders: OrdersRepository) {}

  async create(sessionId: string, input: CreateOrderInput, actor: AuthenticatedUser) {
    const result = rpcObject(await this.orders.create(sessionId, input, actor), "ORDER_CREATE_RESPONSE_INVALID");
    const id = result.id;
    if (typeof id !== "string") throw new AppError(500, "ORDER_CREATE_RESPONSE_INVALID", "La comanda se creó, pero su identificador no es válido.");
    return this.get(id);
  }

  async get(id: string) {
    const aggregate = await this.orders.findOrder(id);
    if (!aggregate) throw new AppError(404, "ORDER_NOT_FOUND", "La comanda no existe.");
    return publicOrder(aggregate);
  }

  async listForSession(sessionId: string) {
    const result = await this.orders.listForCurrentSession(sessionId);
    if (!result) throw new AppError(404, "SERVICE_SESSION_NOT_FOUND", "La sesión no existe.");
    return {
      session: {
        id: result.session.id,
        status: result.session.status,
        servicePoint: { id: result.point.id, name: result.point.name },
      },
      orders: result.orders.map(publicOrder),
    };
  }

  async transition(id: string, action: "START" | "READY" | "DELIVER", actor: AuthenticatedUser) {
    const result = rpcObject(await this.orders.transition(id, action, actor), "ORDER_ITEM_TRANSITION_RESPONSE_INVALID");
    return {
      orderItemId: typeof result.orderItemId === "string" ? result.orderItemId : id,
      status: result.status,
      preparationStation: result.preparationStation,
      preparingAt: result.preparingAt ?? null,
      readyAt: result.readyAt ?? null,
      deliveredAt: result.deliveredAt ?? null,
    };
  }

  async cancel(id: string, reason: string, actor: AuthenticatedUser) {
    const result = rpcObject(await this.orders.cancel(id, reason, actor), "ORDER_ITEM_CANCEL_RESPONSE_INVALID");
    return {
      orderItemId: typeof result.orderItemId === "string" ? result.orderItemId : id,
      status: result.status,
      cancelledFromStatus: result.cancelledFromStatus,
      cancelledAt: result.cancelledAt,
      cancellationReason: result.cancellationReason,
    };
  }
}

export const ordersService = new OrdersService(ordersRepository);
