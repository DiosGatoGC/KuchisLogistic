export const CAPABILITIES = [
  "tables.view",
  "tables.operate",
  "orders.create",
  "orders.transfer",
  "orders.cancel",
  "tables.release",
  "orders.kitchen.view",
  "orders.kitchen.manage",
  "orders.drinks.view",
  "orders.drinks.manage",
  "catalog.availability",
  "shift.open",
  "shift.close",
  "payments.charge",
  "expenses.view",
  "expenses.manage",
  "cash.reconcile",
  "history.view",
  "users.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type UserRole = "ADMIN" | "MANAGER" | "WAITER" | "CASHIER" | "KITCHEN";

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  capabilities: Capability[];
}

export interface PublicSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number | null;
  tokenType: string;
}

export interface LoginResult {
  user: AuthenticatedUser;
  session: PublicSession;
}

export interface MeResult {
  user: AuthenticatedUser;
}
