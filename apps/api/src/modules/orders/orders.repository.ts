import type { Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { CreateOrderInput } from "./orders.schemas";
import type {
  AdditionRow,
  OrderAggregate,
  OrderItemRow,
  OrderRow,
  PointRow,
  PreparationStation,
  ProfileRow,
  QueueAggregate,
  SessionRow,
} from "./orders.types";

export interface OrdersRepository {
  create(sessionId: string, input: CreateOrderInput, actor: AuthenticatedUser): Promise<Json>;
  findOrder(id: string): Promise<OrderAggregate | null>;
  listForCurrentSession(sessionId: string): Promise<{ session: SessionRow; point: PointRow; orders: OrderAggregate[] } | null>;
  listQueue(station: PreparationStation): Promise<QueueAggregate[]>;
  findItem(id: string): Promise<OrderItemRow | null>;
  transition(id: string, action: "START" | "READY" | "DELIVER", actor: AuthenticatedUser): Promise<Json>;
  cancel(id: string, reason: string, actor: AuthenticatedUser): Promise<Json>;
}

const orderColumns = "id, service_session_id, sequence_number, notes, sent_at, created_by, created_by_role, created_at";
const itemColumns = "id, order_id, current_service_session_id, line_number, product_id, product_name, unit_price, quantity, notes, preparation_station, status, preparing_at, ready_at, delivered_at, cancelled_by, cancelled_by_role, cancelled_at, cancellation_reason, cancelled_from_status, created_at, updated_at";
const additionColumns = "id, order_item_id, product_id, addition_name, unit_price, quantity_per_item, created_at";
const sessionColumns = "id, service_point_id, shift_id, opened_by, opened_by_role, closed_by, closed_by_role, status, cancellation_reason, opened_at, closed_at";
const pointColumns = "id, name, type, sort_order, is_active";

function persistenceError(cause: unknown) {
  return new AppError(500, "ORDERS_PERSISTENCE_FAILED", "No se pudieron consultar las comandas.", undefined, { cause });
}

function relationshipError() {
  return new AppError(500, "ORDER_RELATIONSHIP_INVALID", "La comanda no está configurada correctamente.");
}

function unique(values: string[]) { return [...new Set(values)]; }

function groupBy<T>(values: T[], key: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
}

async function loadAdditions(itemIds: string[]): Promise<AdditionRow[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await supabaseAdmin.from("order_item_additions").select(additionColumns).in("order_item_id", itemIds);
  if (error) throw persistenceError(error);
  return data;
}

async function hydrate(orderRows: OrderRow[], itemRows: OrderItemRow[]): Promise<OrderAggregate[]> {
  if (orderRows.length === 0) return [];
  const sessionIds = unique(orderRows.map((order) => order.service_session_id));
  const creatorIds = unique(orderRows.map((order) => order.created_by));
  const [sessionsResult, profilesResult, additions] = await Promise.all([
    supabaseAdmin.from("service_sessions").select(sessionColumns).in("id", sessionIds),
    supabaseAdmin.from("profiles").select("id, full_name").in("id", creatorIds),
    loadAdditions(itemRows.map((item) => item.id)),
  ]);
  if (sessionsResult.error) throw persistenceError(sessionsResult.error);
  if (profilesResult.error) throw persistenceError(profilesResult.error);
  const sessions = sessionsResult.data as SessionRow[];
  const profiles = profilesResult.data as ProfileRow[];
  const pointIds = unique(sessions.map((session) => session.service_point_id));
  const pointsResult = await supabaseAdmin.from("service_points").select(pointColumns).in("id", pointIds);
  if (pointsResult.error) throw persistenceError(pointsResult.error);

  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  const pointById = new Map((pointsResult.data as PointRow[]).map((row) => [row.id, row]));
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const additionsByItem = groupBy(additions, (row) => row.order_item_id);
  const itemsByOrder = groupBy(itemRows, (row) => row.order_id);

  return orderRows.map((order) => {
    const originalSession = sessionById.get(order.service_session_id);
    const creator = profileById.get(order.created_by);
    const servicePoint = originalSession && pointById.get(originalSession.service_point_id);
    if (!originalSession || !servicePoint || !creator) throw relationshipError();
    return {
      order,
      originalSession,
      servicePoint,
      creator,
      items: (itemsByOrder.get(order.id) ?? [])
        .sort((a, b) => a.line_number - b.line_number)
        .map((item) => ({ item, additions: additionsByItem.get(item.id) ?? [] })),
    };
  });
}

export const ordersRepository: OrdersRepository = {
  async create(sessionId, input, actor) {
    const items: Json = input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes ?? "",
      additions: item.additions.map((addition) => ({
        productId: addition.productId,
        quantityPerItem: addition.quantityPerItem,
      })),
    }));
    const { data, error } = await supabaseAdmin.rpc("logistics_create_order", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_items: items,
      p_notes: input.notes ?? "",
      p_service_session_id: sessionId,
    });
    if (error) throw mapRpcError(error, "ORDER_CREATE_FAILED");
    return data;
  },

  async findOrder(id) {
    const orderResult = await supabaseAdmin.from("orders").select(orderColumns).eq("id", id).maybeSingle();
    if (orderResult.error) throw persistenceError(orderResult.error);
    if (!orderResult.data) return null;
    const itemsResult = await supabaseAdmin.from("order_items").select(itemColumns).eq("order_id", id);
    if (itemsResult.error) throw persistenceError(itemsResult.error);
    return (await hydrate([orderResult.data], itemsResult.data))[0] ?? null;
  },

  async listForCurrentSession(sessionId) {
    const sessionResult = await supabaseAdmin.from("service_sessions").select(sessionColumns).eq("id", sessionId).maybeSingle();
    if (sessionResult.error) throw persistenceError(sessionResult.error);
    if (!sessionResult.data) return null;
    const [pointResult, itemsResult] = await Promise.all([
      supabaseAdmin.from("service_points").select(pointColumns).eq("id", sessionResult.data.service_point_id).maybeSingle(),
      supabaseAdmin.from("order_items").select(itemColumns).eq("current_service_session_id", sessionId),
    ]);
    if (pointResult.error) throw persistenceError(pointResult.error);
    if (itemsResult.error) throw persistenceError(itemsResult.error);
    if (!pointResult.data) throw relationshipError();
    const orderIds = unique(itemsResult.data.map((item) => item.order_id));
    if (orderIds.length === 0) return { session: sessionResult.data, point: pointResult.data, orders: [] };
    const ordersResult = await supabaseAdmin.from("orders").select(orderColumns).in("id", orderIds).order("sent_at", { ascending: true });
    if (ordersResult.error) throw persistenceError(ordersResult.error);
    return { session: sessionResult.data, point: pointResult.data, orders: await hydrate(ordersResult.data, itemsResult.data) };
  },

  async listQueue(station) {
    const itemsResult = await supabaseAdmin.from("order_items").select(itemColumns).eq("preparation_station", station).in("status", ["PENDING", "PREPARING", "READY"]);
    if (itemsResult.error) throw persistenceError(itemsResult.error);
    const items = itemsResult.data;
    if (items.length === 0) return [];
    const orderIds = unique(items.map((item) => item.order_id));
    const sessionIds = unique(items.map((item) => item.current_service_session_id));
    const [ordersResult, sessionsResult, additions] = await Promise.all([
      supabaseAdmin.from("orders").select(orderColumns).in("id", orderIds),
      supabaseAdmin.from("service_sessions").select(sessionColumns).in("id", sessionIds),
      loadAdditions(items.map((item) => item.id)),
    ]);
    if (ordersResult.error) throw persistenceError(ordersResult.error);
    if (sessionsResult.error) throw persistenceError(sessionsResult.error);
    const pointIds = unique(sessionsResult.data.map((session) => session.service_point_id));
    const pointsResult = await supabaseAdmin.from("service_points").select(pointColumns).in("id", pointIds);
    if (pointsResult.error) throw persistenceError(pointsResult.error);
    const orderById = new Map(ordersResult.data.map((row) => [row.id, row]));
    const sessionById = new Map(sessionsResult.data.map((row) => [row.id, row]));
    const pointById = new Map(pointsResult.data.map((row) => [row.id, row]));
    const additionsByItem = groupBy(additions, (row) => row.order_item_id);
    return items.map((item) => {
      const order = orderById.get(item.order_id);
      const currentSession = sessionById.get(item.current_service_session_id);
      const servicePoint = currentSession && pointById.get(currentSession.service_point_id);
      if (!order || !currentSession || !servicePoint) throw relationshipError();
      return { item, order, currentSession, servicePoint, additions: additionsByItem.get(item.id) ?? [] };
    });
  },

  async findItem(id) {
    const { data, error } = await supabaseAdmin.from("order_items").select(itemColumns).eq("id", id).maybeSingle();
    if (error) throw persistenceError(error);
    return data;
  },

  async transition(id, action, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_transition_order_item", { p_action: action, p_actor_id: actor.id, p_actor_role: actor.role, p_order_item_id: id });
    if (error) throw mapRpcError(error, "ORDER_ITEM_TRANSITION_FAILED");
    return data;
  },

  async cancel(id, reason, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_cancel_order_item", { p_actor_id: actor.id, p_actor_role: actor.role, p_order_item_id: id, p_reason: reason });
    if (error) throw mapRpcError(error, "ORDER_ITEM_CANCEL_FAILED");
    return data;
  },
};
