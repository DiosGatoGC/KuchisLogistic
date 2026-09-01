import type { Json } from "@kuchis/shared/database-types";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import { expensesRepository, type ExpensesRepository } from "./expenses.repository";
import type { RecordExpenseInput } from "./expenses.schemas";
import type { ExpenseAggregate } from "./expenses.types";

function rpcObject(value: Json, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(500, code, "La operación terminó con una respuesta inválida.");
  }
  return value;
}

function requiredString(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function requiredNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function publicExpense(aggregate: ExpenseAggregate) {
  const { expense, recordedBy, voidedBy } = aggregate;
  return {
    id: expense.id,
    shiftId: expense.shift_id,
    category: expense.category,
    customCategory: expense.custom_category,
    description: expense.description,
    amount: expense.amount,
    recordedAt: expense.recorded_at,
    recordedBy: {
      id: recordedBy.id,
      fullName: recordedBy.full_name,
      role: expense.recorded_by_role,
    },
    voided: expense.voided_at !== null,
    voidedAt: expense.voided_at,
    voidReason: expense.void_reason,
    voidedBy:
      voidedBy && expense.voided_by_role
        ? { id: voidedBy.id, fullName: voidedBy.full_name, role: expense.voided_by_role }
        : null,
  };
}

export class ExpensesService {
  constructor(private readonly expenses: ExpensesRepository) {}

  async current() {
    const shiftId = await this.expenses.findCurrentShiftId();
    if (!shiftId) {
      return { shift: null, expenses: [], activeExpensesCount: 0, activeExpensesTotal: 0 };
    }
    const rows = await this.expenses.listForShift(shiftId);
    const active = rows.filter(({ expense }) => expense.voided_at === null);
    const activeTotalCents = active.reduce(
      (total, { expense }) => total + toCents(expense.amount),
      0
    );
    return {
      shift: { id: shiftId },
      expenses: rows.map(publicExpense),
      activeExpensesCount: active.length,
      activeExpensesTotal: activeTotalCents / 100,
    };
  }

  async get(id: string) {
    const expense = await this.expenses.findById(id);
    if (!expense) throw new AppError(404, "SHIFT_EXPENSE_NOT_FOUND", "El gasto no existe.");
    return publicExpense(expense);
  }

  async record(input: RecordExpenseInput, actor: AuthenticatedUser) {
    const result = rpcObject(
      await this.expenses.record(input, actor),
      "SHIFT_EXPENSE_RECORD_RESPONSE_INVALID"
    );
    const id = requiredString(result.id);
    const resultShiftId = requiredString(result.shiftId);
    const recordedAt = requiredString(result.recordedAt);
    const description = requiredString(result.description);
    const amount = requiredNumber(result.amount);
    if (
      !id || !resultShiftId || !recordedAt || !description || amount === null ||
      result.category !== input.category
    ) {
      throw new AppError(
        500,
        "SHIFT_EXPENSE_RECORD_RESPONSE_INVALID",
        "El registro del gasto terminó con una respuesta inválida."
      );
    }
    return {
      id,
      shiftId: resultShiftId,
      category: input.category,
      customCategory:
        typeof result.customCategory === "string" ? result.customCategory : null,
      description,
      amount,
      recordedAt,
      recordedBy: { id: actor.id, fullName: actor.fullName, role: actor.role },
      voided: false,
      voidedAt: null,
      voidReason: null,
      voidedBy: null,
    };
  }

  async void(id: string, reason: string, actor: AuthenticatedUser) {
    const existing = await this.expenses.findById(id);
    if (!existing) throw new AppError(404, "SHIFT_EXPENSE_NOT_FOUND", "El gasto no existe.");
    const result = rpcObject(
      await this.expenses.void(id, reason, actor),
      "SHIFT_EXPENSE_VOID_RESPONSE_INVALID"
    );
    const resultId = requiredString(result.id);
    const voidedAt = requiredString(result.voidedAt);
    const voidReason = requiredString(result.voidReason);
    if (resultId !== id || !voidedAt || !voidReason || result.voided !== true) {
      throw new AppError(
        500,
        "SHIFT_EXPENSE_VOID_RESPONSE_INVALID",
        "La anulación del gasto terminó con una respuesta inválida."
      );
    }
    return {
      ...publicExpense(existing),
      voided: true,
      voidedAt,
      voidReason,
      voidedBy: { id: actor.id, fullName: actor.fullName, role: actor.role },
    };
  }
}

export const expensesService = new ExpensesService(expensesRepository);
