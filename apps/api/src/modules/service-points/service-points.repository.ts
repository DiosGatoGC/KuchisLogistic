import type { Database, Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { isUniqueViolation } from "../../database/postgres-errors";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";

export type ServicePoint =
  Database["public"]["Tables"]["service_points"]["Row"];
export type ServiceSession =
  Database["public"]["Tables"]["service_sessions"]["Row"];
type ServiceSessionInsert =
  Database["public"]["Tables"]["service_sessions"]["Insert"];
type SessionStatus = Database["public"]["Enums"]["session_status"];

export interface ServicePointsRepository {
  list(): Promise<ServicePoint[]>;
  findById(id: string): Promise<ServicePoint | null>;
}

export interface ServiceSessionsRepository {
  listActive(): Promise<ServiceSession[]>;
  findActiveForPoint(servicePointId: string): Promise<ServiceSession | null>;
  findById(id: string): Promise<ServiceSession | null>;
  create(input: ServiceSessionInsert): Promise<ServiceSession>;
  transition(
    id: string,
    from: SessionStatus,
    to: SessionStatus
  ): Promise<ServiceSession | null>;
}

export interface ServiceSessionReleaseRepository {
  release(id: string, reason: string, actor: AuthenticatedUser): Promise<Json>;
}

const pointColumns = "id, name, type, sort_order, is_active";
const sessionColumns =
  "id, service_point_id, shift_id, opened_by, opened_by_role, closed_by, closed_by_role, status, cancellation_reason, opened_at, closed_at";
const activeStatuses = ["OPEN", "AWAITING_PAYMENT"] as const;

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "SERVICE_POINTS_PERSISTENCE_FAILED",
    "No se pudo completar la operación de mesas y sesiones.",
    undefined,
    { cause }
  );
}

function occupiedError(cause?: unknown) {
  return new AppError(
    409,
    "SERVICE_POINT_OCCUPIED",
    "El punto de servicio ya tiene una sesión activa.",
    undefined,
    cause === undefined ? undefined : { cause }
  );
}

export const servicePointsRepository: ServicePointsRepository = {
  async list() {
    const { data, error } = await supabaseAdmin
      .from("service_points")
      .select(pointColumns)
      .order("sort_order", { ascending: true });

    if (error) throw persistenceError(error);
    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("service_points")
      .select(pointColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) throw persistenceError(error);
    return data;
  },
};

export const serviceSessionsRepository: ServiceSessionsRepository &
  ServiceSessionReleaseRepository = {
  async listActive() {
    const { data, error } = await supabaseAdmin
      .from("service_sessions")
      .select(sessionColumns)
      .in("status", activeStatuses);

    if (error) throw persistenceError(error);
    return data;
  },

  async findActiveForPoint(servicePointId) {
    const { data, error } = await supabaseAdmin
      .from("service_sessions")
      .select(sessionColumns)
      .eq("service_point_id", servicePointId)
      .in("status", activeStatuses)
      .maybeSingle();

    if (error) throw persistenceError(error);
    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("service_sessions")
      .select(sessionColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) throw persistenceError(error);
    return data;
  },

  async create(input) {
    const { data, error } = await supabaseAdmin
      .from("service_sessions")
      .insert(input)
      .select(sessionColumns)
      .single();

    if (error) {
      if (isUniqueViolation(error)) throw occupiedError(error);
      if (error.code === "P0001") {
        throw mapRpcError(error, "SERVICE_POINT_OPEN_FAILED");
      }
      throw persistenceError(error);
    }
    return data;
  },

  async transition(id, from, to) {
    const { data, error } = await supabaseAdmin
      .from("service_sessions")
      .update({ status: to })
      .eq("id", id)
      .eq("status", from)
      .select(sessionColumns)
      .maybeSingle();

    if (error) throw persistenceError(error);
    return data;
  },

  async release(id, reason, actor) {
    const { data, error } = await supabaseAdmin.rpc(
      "logistics_release_empty_service_session",
      {
        p_actor_id: actor.id,
        p_actor_role: actor.role,
        p_reason: reason,
        p_service_session_id: id,
      }
    );
    if (error) throw mapRpcError(error, "SERVICE_SESSION_RELEASE_FAILED");
    return data;
  },
};

export const servicePointOccupiedError = occupiedError;
