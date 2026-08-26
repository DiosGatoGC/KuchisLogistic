import { ordersRepository, type OrdersRepository } from "../orders/orders.repository";
import type { PreparationStation } from "../orders/orders.types";

export class PreparationService {
  constructor(private readonly orders: OrdersRepository) {}

  async queue(station: PreparationStation) {
    const rows = await this.orders.listQueue(station);
    return rows
      .sort((a, b) => a.order.sent_at.localeCompare(b.order.sent_at) || a.item.line_number - b.item.line_number)
      .map(({ item, additions, order, currentSession, servicePoint }) => ({
        orderItem: {
          id: item.id,
          productName: item.product_name,
          quantity: item.quantity,
          notes: item.notes,
          status: item.status,
          preparationStation: item.preparation_station,
          preparingAt: item.preparing_at,
          readyAt: item.ready_at,
          deliveredAt: item.delivered_at,
        },
        additions: additions.map((addition) => ({
          productId: addition.product_id,
          additionName: addition.addition_name,
          quantityPerItem: addition.quantity_per_item,
        })),
        order: { id: order.id, sequenceNumber: order.sequence_number, sentAt: order.sent_at },
        session: { id: currentSession.id },
        servicePoint: { id: servicePoint.id, name: servicePoint.name },
      }));
  }
}

export const preparationService = new PreparationService(ordersRepository);
