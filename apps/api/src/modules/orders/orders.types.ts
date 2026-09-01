import type { Database } from "@kuchis/shared/database-types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type AdditionRow = Database["public"]["Tables"]["order_item_additions"]["Row"];
export type SessionRow = Database["public"]["Tables"]["service_sessions"]["Row"];
export type PointRow = Database["public"]["Tables"]["service_points"]["Row"];
export type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name"
>;
export type PreparationStation = Database["public"]["Enums"]["preparation_station"];

export interface OrderAggregate {
  order: OrderRow;
  originalSession: SessionRow;
  servicePoint: PointRow;
  creator: ProfileRow;
  items: Array<{ item: OrderItemRow; additions: AdditionRow[] }>;
}

export interface QueueAggregate {
  item: OrderItemRow;
  additions: AdditionRow[];
  order: OrderRow;
  currentSession: SessionRow;
  servicePoint: PointRow;
}
