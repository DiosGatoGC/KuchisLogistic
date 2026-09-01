import type { AuthenticatedUser } from "../auth/auth.types";
import { AppError } from "../../errors/app-error";
import { z } from "zod";
import {
  shiftsRepository,
  shiftAlreadyOpenError,
  type Shift,
  type ShiftClosure,
  type CashReconciliation,
  type ShiftsRepository,
  type ShiftOperationsRepository,
} from "./shifts.repository";
import type { ReconcileShiftBody } from "./shifts.schemas";
import type {
  PublicCashReconciliation,
  PublicShift,
  PublicShiftClosure,
} from "./shifts.types";

const userRoleSchema = z.enum(["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"]);
const closeResponseSchema = z
  .object({
    closureId: z.uuid(), shiftId: z.uuid(), shiftStatus: z.literal("CLOSED"),
    closedAt: z.string().min(1), closedBy: z.uuid(), closedByRole: userRoleSchema,
    openingCash: z.number().finite(), businessSalesTotal: z.number().finite(),
    cashTotal: z.number().finite(), yapeTotal: z.number().finite(), cardTotal: z.number().finite(),
    cardFeeTotal: z.number().finite(), customerCardTotal: z.number().finite(),
    operationalExpensesCount: z.number().int().nonnegative(), operationalExpensesTotal: z.number().finite(),
    expectedCashAtClose: z.number().finite(), serviceSessionsCount: z.number().int().nonnegative(),
    cancelledSessionsCount: z.number().int().nonnegative(), ordersCount: z.number().int().nonnegative(),
    orderItemsCount: z.number().int().nonnegative(), productUnitsCount: z.number().int().nonnegative(),
    cancelledOrderItemsCount: z.number().int().nonnegative(), cancelledPendingCount: z.number().int().nonnegative(),
    cancelledPreparingCount: z.number().int().nonnegative(), cancelledReadyCount: z.number().int().nonnegative(),
    cancelledDeliveredCount: z.number().int().nonnegative(), serviceSessionTransfersCount: z.number().int().nonnegative(),
    orderItemTransfersCount: z.number().int().nonnegative(), closingNotes: z.string().nullable(),
    summary: z.json(),
  })
  .strict();
const reconciliationResponseSchema = z
  .object({
    reconciliationId: z.uuid(), shiftId: z.uuid(), reconciledAt: z.string().min(1),
    reconciledBy: z.uuid(), reconciledByRole: userRoleSchema,
    openingCashSnapshot: z.number().finite(), cashSalesExpected: z.number().finite(),
    cashExpensesSnapshot: z.number().finite(), expectedCash: z.number().finite(),
    countedCash: z.number().finite(), cashDifference: z.number().finite(),
    expectedYape: z.number().finite(), confirmedYape: z.number().finite(), yapeDifference: z.number().finite(),
    expectedCardBusiness: z.number().finite(), expectedCardFee: z.number().finite(),
    expectedCardCustomerTotal: z.number().finite(), confirmedCardCustomerTotal: z.number().finite(),
    cardDifference: z.number().finite(), notes: z.string().nullable(),
  })
  .strict();

export function toPublicShift(shift: Shift): PublicShift {
  return {
    id: shift.id,
    status: shift.status,
    openingCash: shift.opening_cash,
    openedAt: shift.opened_at,
    closedAt: shift.closed_at,
    openedBy: {
      id: shift.opened_by,
      role: shift.opened_by_role,
    },
    closedBy:
      shift.closed_by && shift.closed_by_role
        ? { id: shift.closed_by, role: shift.closed_by_role }
        : null,
  };
}

export function toPublicClosure(closure: ShiftClosure): PublicShiftClosure {
  return {
    id: closure.id, shiftId: closure.shift_id,
    closedBy: { id: closure.closed_by, role: closure.closed_by_role },
    createdAt: closure.created_at,
    businessSalesTotal: closure.business_sales_total, cashTotal: closure.cash_total,
    yapeTotal: closure.yape_total, cardTotal: closure.card_total,
    cardFeeTotal: closure.card_fee_total, customerCardTotal: closure.customer_card_total,
    operationalExpensesCount: closure.operational_expenses_count,
    operationalExpensesTotal: closure.operational_expenses_total,
    serviceSessionsCount: closure.service_sessions_count,
    cancelledSessionsCount: closure.cancelled_sessions_count, ordersCount: closure.orders_count,
    orderItemsCount: closure.order_items_count, productUnitsCount: closure.product_units_count,
    cancelledOrderItemsCount: closure.cancelled_order_items_count,
    cancelledPendingCount: closure.cancelled_pending_count,
    cancelledPreparingCount: closure.cancelled_preparing_count,
    cancelledReadyCount: closure.cancelled_ready_count,
    cancelledDeliveredCount: closure.cancelled_delivered_count,
    serviceSessionTransfersCount: closure.service_session_transfers_count,
    orderItemTransfersCount: closure.order_item_transfers_count,
    closingNotes: closure.closing_notes, summary: closure.summary,
  };
}

export function toPublicReconciliation(row: CashReconciliation): PublicCashReconciliation {
  if (
    row.expected_cash === null || row.cash_difference === null ||
    row.yape_difference === null || row.expected_card_customer_total === null ||
    row.card_difference === null
  ) {
    throw new AppError(500, "CASH_RECONCILIATION_INVALID", "El cuadre almacenado no es válido.");
  }
  return {
    id: row.id, shiftId: row.shift_id,
    reconciledBy: { id: row.reconciled_by, role: row.reconciled_by_role },
    createdAt: row.created_at, openingCashSnapshot: row.opening_cash_snapshot,
    cashSalesExpected: row.cash_sales_expected, cashExpensesSnapshot: row.cash_expenses_snapshot,
    expectedCash: row.expected_cash, countedCash: row.counted_cash,
    cashDifference: row.cash_difference, expectedYape: row.expected_yape,
    confirmedYape: row.confirmed_yape, yapeDifference: row.yape_difference,
    expectedCardBusiness: row.expected_card_business, expectedCardFee: row.expected_card_fee,
    expectedCardCustomerTotal: row.expected_card_customer_total,
    confirmedCardCustomerTotal: row.confirmed_card_customer_total,
    cardDifference: row.card_difference, notes: row.notes,
  };
}

export function expectedCashAtClose(
  openingCash: number,
  cashTotal: number,
  operationalExpensesTotal: number
) {
  return (
    Math.round(openingCash * 100) +
    Math.round(cashTotal * 100) -
    Math.round(operationalExpensesTotal * 100)
  ) / 100;
}

export class ShiftsService {
  constructor(
    private readonly repository: ShiftsRepository,
    private readonly operations: ShiftOperationsRepository = shiftsRepository
  ) {}

  async getCurrent() {
    const shift = await this.repository.findCurrent();
    return shift ? toPublicShift(shift) : null;
  }

  async getById(id: string) {
    const shift = await this.repository.findById(id);
    if (!shift) {
      throw new AppError(404, "SHIFT_NOT_FOUND", "El turno no existe.");
    }
    return toPublicShift(shift);
  }

  async open(openingCash: number, actor: AuthenticatedUser) {
    if (await this.repository.findCurrent()) throw shiftAlreadyOpenError();

    const shift = await this.repository.create({
      opening_cash: openingCash,
      opened_by: actor.id,
      opened_by_role: actor.role,
      status: "OPEN",
    });
    return toPublicShift(shift);
  }

  async close(id: string, closingNotes: string | null, actor: AuthenticatedUser) {
    const parsed = closeResponseSchema.safeParse(
      await this.operations.close(id, closingNotes, actor)
    );
    if (
      !parsed.success || parsed.data.shiftId !== id ||
      parsed.data.closingNotes !== closingNotes ||
      parsed.data.closedBy !== actor.id || parsed.data.closedByRole !== actor.role
    ) {
      throw new AppError(500, "SHIFT_CLOSE_RESPONSE_INVALID", "El cierre terminó con una respuesta inválida.");
    }
    return parsed.data;
  }

  async getClosure(id: string) {
    const [shift, closure] = await Promise.all([
      this.operations.findById(id), this.operations.findClosure(id),
    ]);
    if (!shift) throw new AppError(404, "SHIFT_NOT_FOUND", "El turno no existe.");
    if (!closure) throw new AppError(404, "SHIFT_CLOSURE_NOT_FOUND", "El cierre del turno no existe.");
    return {
      shift: toPublicShift(shift),
      closure: toPublicClosure(closure),
      expectedCashAtClose: expectedCashAtClose(
        shift.opening_cash,
        closure.cash_total,
        closure.operational_expenses_total
      ),
    };
  }

  async reconcile(id: string, input: ReconcileShiftBody, actor: AuthenticatedUser) {
    const parsed = reconciliationResponseSchema.safeParse(
      await this.operations.reconcile(id, input, actor)
    );
    if (
      !parsed.success || parsed.data.shiftId !== id ||
      parsed.data.countedCash !== input.countedCash ||
      parsed.data.confirmedYape !== input.confirmedYape ||
      parsed.data.confirmedCardCustomerTotal !== input.confirmedCardCustomerTotal ||
      parsed.data.reconciledBy !== actor.id || parsed.data.reconciledByRole !== actor.role
    ) {
      throw new AppError(500, "CASH_RECONCILIATION_RESPONSE_INVALID", "El cuadre terminó con una respuesta inválida.");
    }
    return parsed.data;
  }

  async getReconciliation(id: string) {
    const row = await this.operations.findReconciliation(id);
    if (!row) {
      throw new AppError(404, "CASH_RECONCILIATION_NOT_FOUND", "El cuadre del turno no existe.");
    }
    return toPublicReconciliation(row);
  }
}

export const shiftsService = new ShiftsService(shiftsRepository);
