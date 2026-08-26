import type { Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import type {
  CheckoutAdditionRow,
  CheckoutAggregate,
  CheckoutItemRow,
  CheckoutPointRow,
  PaymentMethod,
} from "./checkout.types";

export interface CheckoutRepository {
  findPreview(sessionId: string): Promise<CheckoutAggregate | null>;
  pay(sessionId: string, method: PaymentMethod, actor: AuthenticatedUser): Promise<Json>;
}

const sessionColumns =
  "id, service_point_id, shift_id, opened_by, opened_by_role, closed_by, closed_by_role, status, cancellation_reason, opened_at, closed_at";
const itemColumns =
  "id, product_id, product_name, unit_price, quantity, status, line_number, current_service_session_id";
const additionColumns =
  "id, order_item_id, product_id, addition_name, unit_price, quantity_per_item";

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "CHECKOUT_PERSISTENCE_FAILED",
    "No se pudo consultar el checkout de la sesión.",
    undefined,
    { cause }
  );
}

function relationshipError() {
  return new AppError(
    500,
    "CHECKOUT_RELATIONSHIP_INVALID",
    "La sesión no está configurada correctamente para checkout."
  );
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
}

export const checkoutRepository: CheckoutRepository = {
  async findPreview(sessionId) {
    const sessionResult = await supabaseAdmin
      .from("service_sessions")
      .select(sessionColumns)
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionResult.error) throw persistenceError(sessionResult.error);
    if (!sessionResult.data) return null;

    const [pointResult, itemsResult] = await Promise.all([
      supabaseAdmin
        .from("service_points")
        .select("id, name, type")
        .eq("id", sessionResult.data.service_point_id)
        .maybeSingle(),
      supabaseAdmin
        .from("order_items")
        .select(itemColumns)
        .eq("current_service_session_id", sessionId)
        .neq("status", "CANCELLED")
        .order("line_number", { ascending: true }),
    ]);
    if (pointResult.error) throw persistenceError(pointResult.error);
    if (itemsResult.error) throw persistenceError(itemsResult.error);
    if (!pointResult.data) throw relationshipError();

    const items = itemsResult.data as CheckoutItemRow[];
    let additions: CheckoutAdditionRow[] = [];
    if (items.length > 0) {
      const additionsResult = await supabaseAdmin
        .from("order_item_additions")
        .select(additionColumns)
        .in("order_item_id", items.map((item) => item.id));
      if (additionsResult.error) throw persistenceError(additionsResult.error);
      additions = additionsResult.data as CheckoutAdditionRow[];
    }
    const additionsByItem = groupBy(additions, (addition) => addition.order_item_id);

    return {
      session: sessionResult.data,
      servicePoint: pointResult.data as CheckoutPointRow,
      items: items.map((item) => ({ item, additions: additionsByItem.get(item.id) ?? [] })),
    };
  },

  async pay(sessionId, method, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_pay_service_session", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_method: method,
      p_service_session_id: sessionId,
    });
    if (error) throw mapRpcError(error, "SERVICE_SESSION_PAYMENT_FAILED");
    return data;
  },
};
