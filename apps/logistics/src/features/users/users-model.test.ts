import assert from "node:assert/strict";
import test from "node:test";

import { executePasswordReset, executeUserMutation } from "./users-attempts.ts";
import { userFailureKind, usersErrorMessage } from "./users-errors.ts";
import {
  MANAGED_USER_ROLE_LABELS,
  clearedPasswordFields,
  isCurrentManagedUser,
  normalizeManagedUsers,
  reconcileCreatedUser,
  resetPasswordPayload,
  runWithUserLock,
  selfAccountFollowUp,
  statusChangeModel,
  userActivationIsApplied,
  userUpdateIsApplied,
  usersListPath,
  usersPermissions,
  validateCreateUser,
  validatePasswordReset,
  validateUpdateUser,
} from "./users-model.ts";
import type { ManagedUser } from "./users-types.ts";

function managedUser(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return { id: "user-1", fullName: "Ana Pérez", username: "ana.perez", role: "MANAGER", isActive: true, createdAt: "2026-09-09T10:00:00Z", ...overrides };
}

test("lista construye requests Todos, Activos e Inactivos", () => {
  assert.equal(usersListPath("all"), "/api/logistics/users");
  assert.equal(usersListPath("active"), "/api/logistics/users?status=active");
  assert.equal(usersListPath("inactive"), "/api/logistics/users?status=inactive");
});

test("normaliza usuarios, etiquetas y capability gating sin datos sensibles", () => {
  const normalized = normalizeManagedUsers({ users: [managedUser()] });
  assert.equal(normalized.users[0]?.username, "ana.perez");
  assert.equal(MANAGED_USER_ROLE_LABELS.WAITER, "Mesero");
  assert.deepEqual(usersPermissions([]), { canManage: false });
  assert.deepEqual(usersPermissions(["users.manage"]), { canManage: true });
  assert.equal("password" in normalized.users[0]!, false);
});

test("create valida nombre, usuario normalizado, regex, password, rol, activo y payload exacto", () => {
  const valid = validateCreateUser({ fullName: "  Luis Ruiz ", username: " LUIS.RUIZ ", password: "12345678", role: "CASHIER", isActive: false });
  assert.deepEqual(valid.payload, { fullName: "Luis Ruiz", username: "luis.ruiz", password: "12345678", role: "CASHIER", isActive: false });
  assert.equal(validateCreateUser({ fullName: "", username: "ab", password: "123", role: "WAITER", isActive: true }).payload, null);
  assert.ok((validateCreateUser({ fullName: "Luis", username: "mal usuario", password: "12345678", role: "WAITER", isActive: true }).errors.username ?? "").length > 0);
  assert.equal(validateCreateUser({ fullName: "Luis", username: "usuario", password: "x".repeat(73), role: "WAITER", isActive: true }).payload, null);
  assert.equal(validateCreateUser({ fullName: "Luis", username: "usuario", password: "12345678", role: "OTRO" as "WAITER", isActive: true }).payload, null);
});

test("create reconciliado exige coincidencia única de username", () => {
  assert.equal(reconcileCreatedUser([managedUser()], " ANA.PEREZ ").state, "applied");
  assert.equal(reconcileCreatedUser([], "ana.perez").state, "unchanged");
  assert.equal(reconcileCreatedUser([managedUser(), managedUser({ id: "user-2" })], "ana.perez").state, "ambiguous");
});

test("update exige cambios, genera PATCH exacto y permite reconciliar campos", () => {
  assert.equal(validateUpdateUser(managedUser(), { fullName: "Ana Pérez", username: "ana.perez", role: "MANAGER" }).payload, null);
  const changed = validateUpdateUser(managedUser(), { fullName: " Ana R. ", username: " ANA.NUEVA ", role: "ADMIN" });
  assert.deepEqual(changed.payload, { fullName: "Ana R.", username: "ana.nueva", role: "ADMIN" });
  assert.equal(userUpdateIsApplied(managedUser({ fullName: "Ana R.", username: "ana.nueva", role: "ADMIN" }), changed.payload!), true);
  assert.equal(userUpdateIsApplied(managedUser(), { role: "ADMIN" }), false);
});

test("activación y desactivación comparan estado autoritativo", () => {
  assert.equal(userActivationIsApplied(managedUser(), true), true);
  assert.equal(userActivationIsApplied(managedUser(), false), false);
  assert.equal(userActivationIsApplied(managedUser({ isActive: false }), false), true);
  assert.deepEqual(statusChangeModel(managedUser(), "user-1"), { nextActive: false, requiresConfirmation: true, isSelf: true, strongWarning: true });
  assert.deepEqual(statusChangeModel(managedUser({ isActive: false }), "other"), { nextActive: true, requiresConfirmation: true, isSelf: false, strongWarning: false });
});

test("lock síncrono evita doble submit", async () => {
  const locks = new Set<string>();
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = runWithUserLock(locks, "create", async () => { calls += 1; await pending; });
  const second = await runWithUserLock(locks, "create", async () => { calls += 1; });
  assert.equal(second, undefined);
  assert.equal(calls, 1);
  release();
  await first;
});

test("mutación confirmada y ambigua hacen refetch autoritativo sin retry", async () => {
  let writes = 0;
  let reads = 0;
  const confirmed = await executeUserMutation({ mutate: async () => { writes += 1; return managedUser(); }, refetch: async () => { reads += 1; return managedUser(); }, classifyFailure: userFailureKind });
  assert.equal(confirmed.kind, "confirmed");
  const ambiguous = await executeUserMutation({ mutate: async () => { writes += 1; throw { kind: "network" }; }, refetch: async () => { reads += 1; return managedUser(); }, classifyFailure: userFailureKind });
  assert.equal(ambiguous.kind, "ambiguous");
  assert.equal(writes, 2);
  assert.equal(reads, 2);
});

test("conflicto de username y compensación fallida son explícitos", () => {
  assert.match(usersErrorMessage({ kind: "conflict", code: "USERNAME_ALREADY_EXISTS" }), /ya está en uso/);
  assert.match(usersErrorMessage({ kind: "server", code: "USER_CREATION_COMPENSATION_FAILED" }), /revisión manual/);
});

test("identifica la cuenta actual y decisiones seguras de rol/desactivación", () => {
  assert.equal(isCurrentManagedUser("user-1", "user-1"), true);
  assert.equal(selfAccountFollowUp({ isSelf: true, deactivated: true, roleChanged: false }), "logout");
  assert.equal(selfAccountFollowUp({ isSelf: true, deactivated: false, roleChanged: true }), "rehydrate");
  assert.equal(selfAccountFollowUp({ isSelf: false, deactivated: true, roleChanged: true }), "none");
});

test("password valida longitud y confirmación; éxito no devuelve el secreto", async () => {
  assert.equal(validatePasswordReset("123", "123").newPassword, null);
  assert.equal(validatePasswordReset("12345678", "87654321").newPassword, null);
  assert.equal(validatePasswordReset("12345678", "12345678").newPassword, "12345678");
  assert.deepEqual(resetPasswordPayload("12345678"), { newPassword: "12345678" });
  assert.deepEqual(clearedPasswordFields(), { newPassword: "", confirmPassword: "" });
  const result = await executePasswordReset({ mutate: async () => ({ success: true }), classifyFailure: userFailureKind });
  assert.deepEqual(result, { kind: "confirmed" });
  assert.equal("password" in result, false);
});

test("reset ambiguo nunca reintenta ni afirma éxito", async () => {
  let writes = 0;
  const result = await executePasswordReset({ mutate: async () => { writes += 1; throw { kind: "server" }; }, classifyFailure: userFailureKind });
  assert.equal(result.kind, "ambiguous");
  assert.equal(writes, 1);
});
