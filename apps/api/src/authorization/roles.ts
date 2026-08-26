import type { Database } from "@kuchis/shared/database-types";
import { ALL_CAPABILITIES, type Capability } from "./capabilities";

export type UserRole = Database["public"]["Enums"]["user_role"];

const waiterCapabilities = [
  "tables.view",
  "tables.operate",
  "orders.create",
  "orders.transfer",
  "orders.cancel",
  "tables.release",
  "orders.drinks.view",
  "orders.drinks.manage",
  "catalog.availability",
] as const satisfies readonly Capability[];

const cashierCapabilities = [
  "tables.view",
  "tables.operate",
  "orders.create",
  "orders.transfer",
  "orders.cancel",
  "orders.kitchen.view",
  "orders.drinks.view",
  "catalog.availability",
  "shift.open",
  "shift.close",
  "payments.charge",
  "expenses.view",
  "expenses.manage",
] as const satisfies readonly Capability[];

const kitchenCapabilities = [
  "tables.view",
  "orders.kitchen.view",
  "orders.kitchen.manage",
] as const satisfies readonly Capability[];

export const ROLE_CAPABILITIES = {
  ADMIN: ALL_CAPABILITIES,
  MANAGER: ALL_CAPABILITIES,
  WAITER: waiterCapabilities,
  CASHIER: cashierCapabilities,
  KITCHEN: kitchenCapabilities,
} as const satisfies Record<UserRole, readonly Capability[]>;

export function getCapabilitiesForRole(role: UserRole): Capability[] {
  return [...ROLE_CAPABILITIES[role]];
}
