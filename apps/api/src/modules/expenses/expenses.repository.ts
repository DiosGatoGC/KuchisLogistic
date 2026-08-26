import type { Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { RecordExpenseInput } from "./expenses.schemas";
import type { ExpenseAggregate, ExpenseProfileRow, ExpenseRow } from "./expenses.types";

export interface ExpensesRepository {
  findCurrentShiftId(): Promise<string | null>;
  listForShift(shiftId: string): Promise<ExpenseAggregate[]>;
  findById(id: string): Promise<ExpenseAggregate | null>;
  record(input: RecordExpenseInput, actor: AuthenticatedUser): Promise<Json>;
  void(id: string, reason: string, actor: AuthenticatedUser): Promise<Json>;
}

const expenseColumns =
  "id, shift_id, recorded_by, recorded_by_role, category, custom_category, description, amount, recorded_at, voided_at, voided_by, voided_by_role, void_reason";

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "EXPENSES_PERSISTENCE_FAILED",
    "No se pudieron consultar los gastos operativos.",
    undefined,
    { cause }
  );
}

function relationshipError() {
  return new AppError(
    500,
    "EXPENSE_RELATIONSHIP_INVALID",
    "El gasto no está configurado correctamente."
  );
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

async function hydrate(rows: ExpenseRow[]): Promise<ExpenseAggregate[]> {
  if (rows.length === 0) return [];
  const profileIds = unique(rows.flatMap((row) => [row.recorded_by, row.voided_by]));
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds);
  if (error) throw persistenceError(error);
  const profiles = data as ExpenseProfileRow[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return rows.map((expense) => {
    const recordedBy = profileById.get(expense.recorded_by);
    const voidedBy = expense.voided_by ? profileById.get(expense.voided_by) : null;
    if (!recordedBy || (expense.voided_by && !voidedBy)) throw relationshipError();
    return { expense, recordedBy, voidedBy: voidedBy ?? null };
  });
}

export const expensesRepository: ExpensesRepository = {
  async findCurrentShiftId() {
    const { data, error } = await supabaseAdmin
      .from("shifts")
      .select("id")
      .eq("status", "OPEN")
      .maybeSingle();
    if (error) throw persistenceError(error);
    return data?.id ?? null;
  },

  async listForShift(shiftId) {
    const { data, error } = await supabaseAdmin
      .from("shift_expenses")
      .select(expenseColumns)
      .eq("shift_id", shiftId)
      .order("recorded_at", { ascending: true });
    if (error) throw persistenceError(error);
    return hydrate(data);
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("shift_expenses")
      .select(expenseColumns)
      .eq("id", id)
      .maybeSingle();
    if (error) throw persistenceError(error);
    if (!data) return null;
    return (await hydrate([data]))[0] ?? null;
  },

  async record(input, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_record_shift_expense", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_amount: input.amount,
      p_category: input.category,
      p_custom_category: input.customCategory ?? "",
      p_description: input.description,
    });
    if (error) throw mapRpcError(error, "SHIFT_EXPENSE_RECORD_FAILED");
    return data;
  },

  async void(id, reason, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_void_shift_expense", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_expense_id: id,
      p_reason: reason,
    });
    if (error) throw mapRpcError(error, "SHIFT_EXPENSE_VOID_FAILED");
    return data;
  },
};
