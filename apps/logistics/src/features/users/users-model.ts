import type { Capability, UserRole } from "../../types/auth.ts";
import type {
  CreateManagedUserInput,
  ManagedUser,
  ManagedUsersResult,
  UpdateManagedUserInput,
  UserStatusFilter,
} from "./users-types.ts";

export const USER_ROLES: readonly UserRole[] = ["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"];
export const MANAGED_USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administración",
  MANAGER: "Gerencia",
  WAITER: "Mesero",
  CASHIER: "Caja",
  KITCHEN: "Cocina",
};

const usernamePattern = /^[a-z0-9._-]+$/;

export function usersPermissions(capabilities: readonly Capability[]) {
  return { canManage: capabilities.includes("users.manage") };
}

export function usersListPath(status: UserStatusFilter) {
  return status === "all" ? "/api/logistics/users" : `/api/logistics/users?status=${status}`;
}

export function normalizeManagedUsers(result: ManagedUsersResult) {
  return { users: result.users.map((user) => ({ ...user })) };
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function validateFullName(value: string, errors: Record<string, string>) {
  const normalized = value.trim();
  if (!normalized) errors.fullName = "El nombre completo es obligatorio.";
  else if (normalized.length > 120) errors.fullName = "El nombre admite hasta 120 caracteres.";
  return normalized;
}

function validateUsername(value: string, errors: Record<string, string>) {
  const normalized = normalizeUsername(value);
  if (normalized.length < 3 || normalized.length > 60) errors.username = "El usuario debe tener entre 3 y 60 caracteres.";
  else if (!usernamePattern.test(normalized)) errors.username = "Usa sólo letras, números, punto, guion o guion bajo.";
  return normalized;
}

function validRole(role: UserRole) {
  return USER_ROLES.includes(role);
}

export function validateCreateUser(input: {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}): { payload: CreateManagedUserInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fullName = validateFullName(input.fullName, errors);
  const username = validateUsername(input.username, errors);
  if (input.password.length < 8 || input.password.length > 72) errors.password = "La contraseña debe tener entre 8 y 72 caracteres.";
  if (!validRole(input.role)) errors.role = "Selecciona un rol válido.";
  if (Object.keys(errors).length > 0) return { payload: null, errors };
  return { payload: { fullName, username, password: input.password, role: input.role, isActive: input.isActive }, errors };
}

export function validateUpdateUser(
  current: ManagedUser,
  input: { fullName: string; username: string; role: UserRole },
): { payload: UpdateManagedUserInput | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fullName = validateFullName(input.fullName, errors);
  const username = validateUsername(input.username, errors);
  if (!validRole(input.role)) errors.role = "Selecciona un rol válido.";
  if (Object.keys(errors).length > 0) return { payload: null, errors };
  const payload: UpdateManagedUserInput = {};
  if (fullName !== current.fullName) payload.fullName = fullName;
  if (username !== current.username) payload.username = username;
  if (input.role !== current.role) payload.role = input.role;
  if (Object.keys(payload).length === 0) return { payload: null, errors: { form: "No hay cambios para guardar." } };
  return { payload, errors };
}

export function validatePasswordReset(password: string, confirmation: string) {
  const errors: Record<string, string> = {};
  if (password.length < 8 || password.length > 72) errors.password = "La contraseña debe tener entre 8 y 72 caracteres.";
  if (confirmation !== password) errors.confirmation = "Las contraseñas no coinciden.";
  return { newPassword: Object.keys(errors).length === 0 ? password : null, errors };
}

export function resetPasswordPayload(newPassword: string) {
  return { newPassword };
}

export function clearedPasswordFields() {
  return { newPassword: "", confirmPassword: "" };
}

export function statusChangeModel(target: ManagedUser, currentUserId: string | undefined) {
  const isSelf = target.id === currentUserId;
  return {
    nextActive: !target.isActive,
    requiresConfirmation: true,
    isSelf,
    strongWarning: isSelf && target.isActive,
  };
}

export function reconcileCreatedUser(users: readonly ManagedUser[], username: string) {
  const matches = users.filter((user) => user.username === normalizeUsername(username));
  if (matches.length === 1) return { state: "applied" as const, user: matches[0] };
  if (matches.length === 0) return { state: "unchanged" as const, user: null };
  return { state: "ambiguous" as const, user: null };
}

export function userUpdateIsApplied(user: ManagedUser, input: UpdateManagedUserInput) {
  return (input.fullName === undefined || user.fullName === input.fullName)
    && (input.username === undefined || user.username === input.username)
    && (input.role === undefined || user.role === input.role);
}

export function userActivationIsApplied(user: ManagedUser, isActive: boolean) {
  return user.isActive === isActive;
}

export function isCurrentManagedUser(targetId: string, currentUserId: string | undefined) {
  return Boolean(currentUserId && targetId === currentUserId);
}

export function selfAccountFollowUp({
  isSelf,
  deactivated,
  roleChanged,
}: {
  isSelf: boolean;
  deactivated: boolean;
  roleChanged: boolean;
}) {
  if (!isSelf) return "none" as const;
  if (deactivated) return "logout" as const;
  if (roleChanged) return "rehydrate" as const;
  return "none" as const;
}

export async function runWithUserLock<T>(
  locks: Set<string>,
  key: string,
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try {
    return await operation();
  } finally {
    locks.delete(key);
  }
}
