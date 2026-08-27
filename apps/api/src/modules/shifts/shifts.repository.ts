import type { Database, Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { isUniqueViolation } from "../../database/postgres-errors";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { ReconcileShiftBody } from "./shifts.schemas";

export type Shift = Database["public"]["Tables"]["shifts"]["Row"];
export type ShiftClosure = Database["public"]["Tables"]["shift_closures"]["Row"];
export type CashReconciliation =
  Database["public"]["Tables"]["cash_reconciliations"]["Row"];
type ShiftInsert = Database["public"]["Tables"]["shifts"]["Insert"];

export interface ShiftsRepository {
  findCurrent(): Promise<Shift | null>;
  findById(id: string): Promise<Shift | null>;
  create(input: ShiftInsert): Promise<Shift>;
}

export interface ShiftOperationsRepository {
  findById(id: string): Promise<Shift | null>;
  findClosure(shiftId: string): Promise<ShiftClosure | null>;
  findReconciliation(shiftId: string): Promise<CashReconciliation | null>;
  close(id: string, closingNotes: string | null, actor: AuthenticatedUser): Promise<Json>;
  reconcile(id: string, input: ReconcileShiftBody, actor: AuthenticatedUser): Promise<Json>;
}

const shiftColumns =
  "id, opened_by, opened_by_role, closed_by, closed_by_role, opening_cash, status, opened_at, closed_at";
const closureColumns =
  "id, shift_id, closed_by, closed_by_role, business_sales_total, cash_total, yape_total, card_total, card_fee_total, customer_card_total, service_sessions_count, cancelled_sessions_count, orders_count, summary, order_items_count, product_units_count, cancelled_order_items_count, cancelled_pending_count, cancelled_preparing_count, cancelled_ready_count, cancelled_delivered_count, service_session_transfers_count, order_item_transfers_count, closing_notes, operational_expenses_count, operational_expenses_total, report_path, created_at";
const reconciliationColumns =
  "id, shift_id, reconciled_by, reconciled_by_role, opening_cash_snapshot, cash_sales_expected, cash_expenses_snapshot, expected_cash, counted_cash, cash_difference, expected_yape, confirmed_yape, yape_difference, expected_card_business, expected_card_fee, expected_card_customer_total, confirmed_card_customer_total, card_difference, notes, created_at, updated_at";

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "SHIFTS_PERSISTENCE_FAILED",
    "No se pudo completar la operación de turnos.",
    undefined,
    { cause }
  );
}

function alreadyOpen(cause?: unknown) {
  return new AppError(
    409,
    "SHIFT_ALREADY_OPEN",
    "Ya existe un turno abierto.",
    undefined,
    cause === undefined ? undefined : { cause }
  );
}

export const shiftsRepository: ShiftsRepository & ShiftOperationsRepository = {
  async findCurrent() {
    const { data, error } = await supabaseAdmin
      .from("shifts")
      .select(shiftColumns)
      .eq("status", "OPEN")
      .maybeSingle();

    if (error) throw persistenceError(error);
    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("shifts")
      .select(shiftColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) throw persistenceError(error);
    return data;
  },

  async findClosure(shiftId) {
    const { data, error } = await supabaseAdmin
      .from("shift_closures")
      .select(closureColumns)
      .eq("shift_id", shiftId)
      .maybeSingle();
    if (error) throw persistenceError(error);
    return data;
  },

  async findReconciliation(shiftId) {
    const { data, error } = await supabaseAdmin
      .from("cash_reconciliations")
      .select(reconciliationColumns)
      .eq("shift_id", shiftId)
      .maybeSingle();
    if (error) throw persistenceError(error);
    return data;
  },

  async create(input) {
    const { data, error } = await supabaseAdmin
      .from("shifts")
      .insert(input)
      .select(shiftColumns)
      .single();

    if (error) {
      if (isUniqueViolation(error)) throw alreadyOpen(error);
      throw persistenceError(error);
    }
    return data;
  },

  async close(id, closingNotes, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_close_shift", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_closing_notes: closingNotes as string,
      p_shift_id: id,
    });
    if (error) throw mapRpcError(error, "SHIFT_CLOSE_FAILED");
    return data;
  },

  async reconcile(id, input, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_reconcile_shift", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_confirmed_card_customer_total: input.confirmedCardCustomerTotal,
      p_confirmed_yape: input.confirmedYape,
      p_counted_cash: input.countedCash,
      p_notes: (input.notes ?? null) as string,
      p_shift_id: id,
    });
    if (error) throw mapRpcError(error, "CASH_RECONCILIATION_FAILED");
    return data;
  },
};

export const shiftAlreadyOpenError = alreadyOpen;
