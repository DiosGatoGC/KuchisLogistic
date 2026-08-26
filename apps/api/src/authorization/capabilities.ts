export const ALL_CAPABILITIES = [
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

export type Capability = (typeof ALL_CAPABILITIES)[number];

export function hasCapability(
  user: { capabilities: readonly Capability[] },
  capability: Capability
) {
  return user.capabilities.includes(capability);
}
