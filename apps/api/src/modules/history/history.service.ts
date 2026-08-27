import type { UserRole } from "../../authorization/roles";
import { AppError } from "../../errors/app-error";
import {
  expectedCashAtClose,
  toPublicClosure,
  toPublicReconciliation,
} from "../shifts/shifts.service";
import { historyRepository, type HistoryRepository } from "./history.repository";
import type { HistoryPagination } from "./history.schemas";
import type { HistoryDetailData, HistoryProfileRow } from "./history.types";

function profileMap(rows: HistoryProfileRow[]) {
  return new Map(rows.map((profile) => [profile.id, profile.full_name]));
}

function actor(
  id: string | null,
  role: UserRole | null,
  profiles: Map<string, string>
) {
  if (!id) return null;
  return {
    id,
    fullName: profiles.get(id) ?? null,
    fullNameSource: "CURRENT_PROFILE" as const,
    role,
  };
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
}

export class HistoryService {
  constructor(private readonly history: HistoryRepository) {}

  async list(pagination: HistoryPagination) {
    const data = await this.history.listClosed(pagination);
    const profiles = profileMap(data.profiles);
    const closureByShift = new Map(data.closures.map((row) => [row.shift_id, row]));
    const reconciled = new Set(data.reconciledShiftIds);
    const items = data.shifts.map((shift) => {
      const closure = closureByShift.get(shift.id);
      if (!closure || !shift.closed_by || !shift.closed_by_role || !shift.closed_at) {
        throw new AppError(500, "SHIFT_HISTORY_RELATIONSHIP_INVALID", "El historial del turno no es válido.");
      }
      return {
        shiftId: shift.id,
        openedAt: shift.opened_at,
        closedAt: shift.closed_at,
        openedBy: actor(shift.opened_by, shift.opened_by_role, profiles),
        closedBy: actor(shift.closed_by, shift.closed_by_role, profiles),
        businessSalesTotal: closure.business_sales_total,
        cashTotal: closure.cash_total,
        yapeTotal: closure.yape_total,
        cardTotal: closure.card_total,
        cardFeeTotal: closure.card_fee_total,
        customerCardTotal: closure.customer_card_total,
        operationalExpensesTotal: closure.operational_expenses_total,
        serviceSessionsCount: closure.service_sessions_count,
        ordersCount: closure.orders_count,
        reconciliationExists: reconciled.has(shift.id),
      };
    });
    return {
      items,
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: data.total,
        totalPages: Math.ceil(data.total / pagination.pageSize),
      },
    };
  }

  async detail(shiftId: string) {
    const data = await this.history.findClosedDetail(shiftId);
    if (!data) throw new AppError(404, "SHIFT_HISTORY_NOT_FOUND", "El turno cerrado no existe.");
    if (!data.closure) {
      throw new AppError(500, "SHIFT_HISTORY_RELATIONSHIP_INVALID", "El turno cerrado no tiene snapshot de cierre.");
    }
    return this.toDetail(data);
  }

  private toDetail(data: HistoryDetailData) {
    const profiles = profileMap(data.profiles);
    const pointById = new Map(data.points.map((point) => [point.id, point]));
    const additionsByItem = groupBy(data.additions, (row) => row.order_item_id);
    const itemsByOrder = groupBy(data.items, (row) => row.order_id);

    const sessions = data.sessions.map((session) => {
      const point = pointById.get(session.service_point_id);
      return {
        id: session.id,
        shiftId: session.shift_id,
        status: session.status,
        openedAt: session.opened_at,
        closedAt: session.closed_at,
        openedBy: actor(session.opened_by, session.opened_by_role, profiles),
        closedBy: actor(session.closed_by, session.closed_by_role, profiles),
        cancellationReason: session.cancellation_reason,
        servicePoint: {
          id: session.service_point_id,
          name: point?.name ?? null,
          type: point?.type ?? null,
          nameSource: "CURRENT_SERVICE_POINT" as const,
        },
      };
    });

    const orders = data.orders.map((order) => ({
      id: order.id,
      originalServiceSessionId: order.service_session_id,
      sequenceNumber: order.sequence_number,
      notes: order.notes,
      sentAt: order.sent_at,
      createdAt: order.created_at,
      createdBy: actor(order.created_by, order.created_by_role, profiles),
      items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
        id: item.id,
        orderId: item.order_id,
        currentServiceSessionId: item.current_service_session_id,
        lineNumber: item.line_number,
        productId: item.product_id,
        productName: item.product_name,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        notes: item.notes,
        preparationStation: item.preparation_station,
        status: item.status,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        preparingAt: item.preparing_at,
        readyAt: item.ready_at,
        deliveredAt: item.delivered_at,
        cancellation: item.status === "CANCELLED" ? {
          cancelledAt: item.cancelled_at,
          cancelledFromStatus: item.cancelled_from_status,
          reason: item.cancellation_reason,
          cancelledBy: actor(item.cancelled_by, item.cancelled_by_role, profiles),
        } : null,
        additions: (additionsByItem.get(item.id) ?? []).map((addition) => ({
          id: addition.id,
          productId: addition.product_id,
          additionName: addition.addition_name,
          unitPrice: addition.unit_price,
          quantityPerItem: addition.quantity_per_item,
          createdAt: addition.created_at,
        })),
      })),
    }));

    const closure = toPublicClosure(data.closure!);
    const reconciliation = data.reconciliation
      ? toPublicReconciliation(data.reconciliation)
      : null;
    return {
      shift: {
        id: data.shift.id,
        status: data.shift.status,
        openingCash: data.shift.opening_cash,
        openedAt: data.shift.opened_at,
        closedAt: data.shift.closed_at,
        openedBy: actor(data.shift.opened_by, data.shift.opened_by_role, profiles),
        closedBy: actor(data.shift.closed_by, data.shift.closed_by_role, profiles),
      },
      closure: {
        ...closure,
        closedBy: actor(closure.closedBy.id, closure.closedBy.role, profiles),
        expectedCashAtClose: expectedCashAtClose(
          data.shift.opening_cash,
          closure.cashTotal,
          closure.operationalExpensesTotal
        ),
      },
      reconciliation: reconciliation ? {
        ...reconciliation,
        reconciledBy: actor(
          reconciliation.reconciledBy.id,
          reconciliation.reconciledBy.role,
          profiles
        ),
      } : null,
      serviceSessions: sessions,
      orders,
      payments: data.payments.map((payment) => ({
        id: payment.id,
        serviceSessionId: payment.service_session_id,
        method: payment.method,
        businessAmount: payment.business_amount,
        feeRate: payment.fee_rate,
        feeAmount: payment.fee_amount,
        customerTotal: payment.customer_total,
        paidAt: payment.paid_at,
        receivedBy: actor(payment.received_by, payment.received_by_role, profiles),
      })),
      expenses: data.expenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        customCategory: expense.custom_category,
        description: expense.description,
        amount: expense.amount,
        recordedAt: expense.recorded_at,
        recordedBy: actor(expense.recorded_by, expense.recorded_by_role, profiles),
        voidedAt: expense.voided_at,
        voidReason: expense.void_reason,
        voidedBy: actor(expense.voided_by, expense.voided_by_role, profiles),
      })),
      transfers: {
        serviceSessions: data.sessionTransfers.map((transfer) => ({
          id: transfer.id,
          serviceSessionId: transfer.service_session_id,
          fromServicePoint: {
            id: transfer.from_service_point_id,
            name: transfer.from_service_point_name,
            nameSource: "TRANSFER_SNAPSHOT" as const,
          },
          toServicePoint: {
            id: transfer.to_service_point_id,
            name: transfer.to_service_point_name,
            nameSource: "TRANSFER_SNAPSHOT" as const,
          },
          reason: transfer.reason,
          transferredAt: transfer.transferred_at,
          transferredBy: actor(transfer.transferred_by, transfer.transferred_by_role, profiles),
        })),
        orderItems: data.itemTransfers.map((transfer) => ({
          id: transfer.id,
          orderItemId: transfer.order_item_id,
          fromServiceSessionId: transfer.from_service_session_id,
          toServiceSessionId: transfer.to_service_session_id,
          fromServicePoint: {
            id: transfer.from_service_point_id,
            name: transfer.from_service_point_name,
            nameSource: "TRANSFER_SNAPSHOT" as const,
          },
          toServicePoint: {
            id: transfer.to_service_point_id,
            name: transfer.to_service_point_name,
            nameSource: "TRANSFER_SNAPSHOT" as const,
          },
          quantity: transfer.quantity,
          statusAtTransfer: transfer.status_at_transfer,
          reason: transfer.reason,
          transferredAt: transfer.transferred_at,
          transferredBy: actor(transfer.transferred_by, transfer.transferred_by_role, profiles),
        })),
      },
      audit: data.audit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entity_id,
        serviceSessionId: entry.service_session_id,
        actor: actor(entry.user_id, entry.actor_role, profiles),
        details: entry.details,
        createdAt: entry.created_at,
      })),
    };
  }
}

export const historyService = new HistoryService(historyRepository);
