import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AppError } from "../errors/app-error";
import { UsersService } from "../modules/users/users.service";
import type { UsersAuthGateway } from "../modules/users/users-auth.gateway";
import type {
  ManagedProfile,
  UsersRepository,
} from "../modules/users/users.repository";

const userId = "11111111-1111-4111-8111-111111111111";
const secondUserId = "22222222-2222-4222-8222-222222222222";
const internalEmail = "worker.test@users.kuchis.invalid";

function profile(
  overrides: Partial<ManagedProfile> = {}
): ManagedProfile {
  return {
    id: userId,
    full_name: "Juan Pérez",
    username: "juan.perez",
    auth_email: internalEmail,
    role: "WAITER",
    is_active: true,
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function setup(options?: {
  profiles?: ManagedProfile[];
  createError?: Error;
  compensationError?: Error;
}) {
  const profiles = [...(options?.profiles ?? [])];
  const calls = {
    createdAuth: [] as Array<{ email: string; password: string }>,
    deletedAuth: [] as string[],
    passwordUpdates: [] as Array<{ id: string; password: string }>,
    statuses: [] as Array<"active" | "inactive" | undefined>,
  };

  const repository: UsersRepository = {
    async list(status) {
      calls.statuses.push(status);
      return profiles.filter((item) => {
        if (!status) return true;
        return item.is_active === (status === "active");
      });
    },
    async findById(id) {
      return profiles.find((item) => item.id === id) ?? null;
    },
    async findByUsername(username) {
      return profiles.find((item) => item.username === username) ?? null;
    },
    async create(input) {
      if (options?.createError) throw options.createError;
      const created = profile({ ...input, id: input.id });
      profiles.push(created);
      return created;
    },
    async update(id, input) {
      const index = profiles.findIndex((item) => item.id === id);
      if (index < 0) return null;
      profiles[index] = {
        ...profiles[index],
        ...(input.fullName === undefined ? {} : { full_name: input.fullName }),
        ...(input.username === undefined ? {} : { username: input.username }),
        ...(input.role === undefined ? {} : { role: input.role }),
      };
      return profiles[index];
    },
    async setActive(id, isActive) {
      const item = profiles.find((candidate) => candidate.id === id);
      if (!item) return null;
      item.is_active = isActive;
      return item;
    },
  };

  const gateway: UsersAuthGateway = {
    async create(email, password) {
      calls.createdAuth.push({ email, password });
      return secondUserId;
    },
    async delete(id) {
      calls.deletedAuth.push(id);
      if (options?.compensationError) throw options.compensationError;
    },
    async updatePassword(id, password) {
      calls.passwordUpdates.push({ id, password });
    },
  };

  return {
    service: new UsersService(repository, gateway, () => internalEmail),
    calls,
  };
}

describe("UsersService", () => {
  test("lists active and inactive users without internal fields", async () => {
    const { service, calls } = setup({
      profiles: [profile(), profile({ id: secondUserId, is_active: false })],
    });

    const active = await service.list("active");
    const inactive = await service.list("inactive");

    assert.equal(active.length, 1);
    assert.equal(inactive.length, 1);
    assert.deepEqual(calls.statuses, ["active", "inactive"]);
    assert.equal(JSON.stringify([active, inactive]).includes("auth_email"), false);
  });

  test("creates Auth first and then a profile with the same UUID", async () => {
    const { service, calls } = setup();
    const created = await service.create({
      fullName: "Juan Pérez",
      username: "juan.perez",
      password: "initial-password",
      role: "WAITER",
      isActive: true,
    });

    assert.equal(created.id, secondUserId);
    assert.deepEqual(calls.createdAuth, [
      { email: internalEmail, password: "initial-password" },
    ]);
    assert.equal(JSON.stringify(created).includes("auth_email"), false);
    assert.equal(JSON.stringify(created).includes("password"), false);
  });

  test("rejects a duplicate username before creating Auth", async () => {
    const { service, calls } = setup({ profiles: [profile()] });

    await assert.rejects(
      service.create({
        fullName: "Otro Juan",
        username: "juan.perez",
        password: "initial-password",
        role: "CASHIER",
        isActive: true,
      }),
      (error: AppError) =>
        error.statusCode === 409 && error.code === "USERNAME_ALREADY_EXISTS"
    );
    assert.equal(calls.createdAuth.length, 0);
  });

  test("deletes the new Auth identity when profile creation fails", async () => {
    const profileError = new AppError(
      409,
      "USERNAME_ALREADY_EXISTS",
      "El nombre de usuario ya está en uso."
    );
    const { service, calls } = setup({ createError: profileError });

    await assert.rejects(
      service.create({
        fullName: "Juan Pérez",
        username: "juan.perez",
        password: "initial-password",
        role: "WAITER",
        isActive: true,
      }),
      (error) => error === profileError
    );
    assert.deepEqual(calls.deletedAuth, [secondUserId]);
  });

  test("reports failed compensation explicitly", async () => {
    const { service } = setup({
      createError: new Error("profile failed"),
      compensationError: new Error("delete failed"),
    });

    await assert.rejects(
      service.create({
        fullName: "Juan Pérez",
        username: "juan.perez",
        password: "initial-password",
        role: "WAITER",
        isActive: true,
      }),
      (error: AppError) =>
        error.code === "USER_CREATION_COMPENSATION_FAILED"
    );
  });

  test("activates and deactivates without deleting historical identity", async () => {
    const { service, calls } = setup({ profiles: [profile()] });

    assert.equal((await service.setActive(userId, false)).isActive, false);
    assert.equal((await service.setActive(userId, true)).isActive, true);
    assert.deepEqual(calls.deletedAuth, []);
  });

  test("resets password only through Admin Auth", async () => {
    const { service, calls } = setup({ profiles: [profile()] });
    await service.resetPassword(userId, "new-secure-password");
    assert.deepEqual(calls.passwordUpdates, [
      { id: userId, password: "new-secure-password" },
    ]);
  });

  test("changing username preserves the internal Auth identity", async () => {
    const { service, calls } = setup({ profiles: [profile()] });
    const updated = await service.update(userId, {
      username: "juan.actualizado",
    });

    assert.equal(updated.username, "juan.actualizado");
    assert.equal(calls.createdAuth.length, 0);
    assert.equal(calls.deletedAuth.length, 0);
  });
});
