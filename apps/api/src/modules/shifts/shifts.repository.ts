import type { Database } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { isUniqueViolation } from "../../database/postgres-errors";
import { AppError } from "../../errors/app-error";

export type Shift = Database["public"]["Tables"]["shifts"]["Row"];
type ShiftInsert = Database["public"]["Tables"]["shifts"]["Insert"];

export interface ShiftsRepository {
  findCurrent(): Promise<Shift | null>;
  findById(id: string): Promise<Shift | null>;
  create(input: ShiftInsert): Promise<Shift>;
}

const shiftColumns =
  "id, opened_by, opened_by_role, closed_by, closed_by_role, opening_cash, status, opened_at, closed_at";

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

export const shiftsRepository: ShiftsRepository = {
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
};

export const shiftAlreadyOpenError = alreadyOpen;
