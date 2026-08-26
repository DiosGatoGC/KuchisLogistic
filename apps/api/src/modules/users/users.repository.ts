import type { Database } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { isUniqueViolation } from "../../database/postgres-errors";
import { AppError } from "../../errors/app-error";
import type { UpdateUserInput, UserStatusFilter } from "./users.types";

export type ManagedProfile = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];

export interface UsersRepository {
  list(status?: UserStatusFilter): Promise<ManagedProfile[]>;
  findById(id: string): Promise<ManagedProfile | null>;
  findByUsername(username: string): Promise<ManagedProfile | null>;
  create(profile: ProfileInsert): Promise<ManagedProfile>;
  update(id: string, input: UpdateUserInput): Promise<ManagedProfile | null>;
  setActive(id: string, isActive: boolean): Promise<ManagedProfile | null>;
}

const profileColumns =
  "id, full_name, username, auth_email, role, is_active, created_at, updated_at";

function repositoryError(cause: unknown) {
  return new AppError(
    500,
    "USERS_PERSISTENCE_FAILED",
    "No se pudo completar la operación de usuarios.",
    undefined,
    { cause }
  );
}

function usernameConflict(cause: unknown) {
  return new AppError(
    409,
    "USERNAME_ALREADY_EXISTS",
    "El nombre de usuario ya está en uso.",
    undefined,
    { cause }
  );
}

export const usersRepository: UsersRepository = {
  async list(status) {
    let query = supabaseAdmin
      .from("profiles")
      .select(profileColumns)
      .order("full_name", { ascending: true });

    if (status) query = query.eq("is_active", status === "active");

    const { data, error } = await query;
    if (error) throw repositoryError(error);
    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(profileColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) throw repositoryError(error);
    return data;
  },

  async findByUsername(username) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(profileColumns)
      .eq("username", username)
      .maybeSingle();

    if (error) throw repositoryError(error);
    return data;
  },

  async create(profile) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .insert(profile)
      .select(profileColumns)
      .single();

    if (error) {
      if (isUniqueViolation(error)) throw usernameConflict(error);
      throw repositoryError(error);
    }
    return data;
  },

  async update(id, input) {
    const update: Database["public"]["Tables"]["profiles"]["Update"] = {};
    if (input.fullName !== undefined) update.full_name = input.fullName;
    if (input.username !== undefined) update.username = input.username;
    if (input.role !== undefined) update.role = input.role;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", id)
      .select(profileColumns)
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) throw usernameConflict(error);
      throw repositoryError(error);
    }
    return data;
  },

  async setActive(id, isActive) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", id)
      .select(profileColumns)
      .maybeSingle();

    if (error) throw repositoryError(error);
    return data;
  },
};
