import type { Database } from "@kuchis/shared/database-types";

export type CheckoutSessionRow = Database["public"]["Tables"]["service_sessions"]["Row"];
export type CheckoutPointRow = Pick<
  Database["public"]["Tables"]["service_points"]["Row"],
  "id" | "name" | "type"
>;
export type CheckoutItemRow = Pick<
  Database["public"]["Tables"]["order_items"]["Row"],
  | "id"
  | "product_id"
  | "product_name"
  | "unit_price"
  | "quantity"
  | "status"
  | "line_number"
  | "current_service_session_id"
>;
export type CheckoutAdditionRow = Pick<
  Database["public"]["Tables"]["order_item_additions"]["Row"],
  | "id"
  | "order_item_id"
  | "product_id"
  | "addition_name"
  | "unit_price"
  | "quantity_per_item"
>;
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export interface CheckoutAggregate {
  session: CheckoutSessionRow;
  servicePoint: CheckoutPointRow;
  items: Array<{ item: CheckoutItemRow; additions: CheckoutAdditionRow[] }>;
}
