import type { AuthenticatedUser, Capability } from "@/types/auth";

export function can(
  user: Pick<AuthenticatedUser, "capabilities"> | null,
  capability: Capability,
) {
  return Boolean(user?.capabilities.includes(capability));
}

export function canAny(
  user: Pick<AuthenticatedUser, "capabilities"> | null,
  capabilities: readonly Capability[],
) {
  return capabilities.some((capability) => can(user, capability));
}

export function canAll(
  user: Pick<AuthenticatedUser, "capabilities"> | null,
  capabilities: readonly Capability[],
) {
  return capabilities.every((capability) => can(user, capability));
}
