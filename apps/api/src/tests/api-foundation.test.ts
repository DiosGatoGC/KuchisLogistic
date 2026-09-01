import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, mock, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import app from "../app";
import { ALL_CAPABILITIES } from "../authorization/capabilities";
import { requireCapability } from "../authorization/require-capability.middleware";
import { getCapabilitiesForRole } from "../authorization/roles";
import { AppError, forbidden, unauthorized } from "../errors/app-error";
import type { LoginInput } from "../modules/auth/auth.schemas";
import { authService, AuthService } from "../modules/auth/auth.service";
import type { AuthenticatedUser, LoginResult } from "../modules/auth/auth.types";
import type {
  Profile,
  ProfilesRepository,
} from "../modules/auth/profiles.repository";
import type {
  AuthGateway,
  AuthenticatedSession,
} from "../modules/auth/supabase-auth.gateway";

const adminUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Rafael Obregón",
  username: "r.obregon",
  role: "ADMIN",
  capabilities: getCapabilitiesForRole("ADMIN"),
};

const loginResult: LoginResult = {
  user: adminUser,
  session: {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresIn: 3_600,
    expiresAt: 1_900_000_000,
    tokenType: "bearer",
  },
};

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  mock.restoreAll();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function json(response: globalThis.Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("API foundation and auth routes", () => {
  test("GET /health keeps the existing public contract", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await json(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "kuchis-api");
    assert.equal(typeof body.timestamp, "string");
  });

  test("POST /api/logistics/auth/login normalizes a valid username", async () => {
    mock.method(authService, "login", async (input: LoginInput) => {
      assert.equal(input.username, "r.obregon");
      assert.equal(input.password, "request-only-password");
      return loginResult;
    });

    const response = await fetch(`${baseUrl}/api/logistics/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "  R.Obregon  ",
        password: "request-only-password",
      }),
    });
    const body = await json(response);

    assert.equal(response.status, 200);
    assert.deepEqual(body, loginResult);
    assert.equal(JSON.stringify(body).includes("auth_email"), false);
  });

  test("wrong password and unknown username share the same safe response", async () => {
    const invalidCredentials = () =>
      unauthorized("INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.");

    mock.method(authService, "login", async () => {
      throw invalidCredentials();
    });
    const wrongPasswordResponse = await fetch(
      `${baseUrl}/api/logistics/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "r.obregon",
          password: "incorrect",
        }),
      }
    );
    const wrongPasswordBody = await json(wrongPasswordResponse);

    mock.restoreAll();
    mock.method(authService, "login", async () => {
      throw invalidCredentials();
    });
    const unknownUserResponse = await fetch(
      `${baseUrl}/api/logistics/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "no.existe",
          password: "incorrect",
        }),
      }
    );
    const unknownUserBody = await json(unknownUserResponse);

    assert.equal(wrongPasswordResponse.status, 401);
    assert.equal(unknownUserResponse.status, 401);
    assert.deepEqual(wrongPasswordBody, unknownUserBody);
  });

  test("GET /api/logistics/auth/me without a token returns 401", async () => {
    const response = await fetch(`${baseUrl}/api/logistics/auth/me`);
    const body = await json(response);

    assert.equal(response.status, 401);
    assert.deepEqual(body, {
      error: {
        code: "AUTH_REQUIRED",
        message: "Se requiere autenticación.",
      },
    });
  });

  test("GET /api/logistics/auth/me returns the active token owner", async () => {
    mock.method(authService, "getCurrentUser", async (accessToken: string) => {
      assert.equal(accessToken, "valid-token");
      return adminUser;
    });

    const response = await fetch(`${baseUrl}/api/logistics/auth/me`, {
      headers: { authorization: "Bearer valid-token" },
    });
    const body = await json(response);

    assert.equal(response.status, 200);
    assert.deepEqual(body, { user: adminUser });
  });

  test("an inactive token owner is blocked with 403", async () => {
    mock.method(authService, "getCurrentUser", async () => {
      throw forbidden(
        "ACCOUNT_INACTIVE",
        "La cuenta está inactiva. Contacta a un administrador."
      );
    });

    const response = await fetch(`${baseUrl}/api/logistics/auth/me`, {
      headers: { authorization: "Bearer old-token" },
    });
    const body = await json(response);

    assert.equal(response.status, 403);
    assert.deepEqual(body, {
      error: {
        code: "ACCOUNT_INACTIVE",
        message: "La cuenta está inactiva. Contacta a un administrador.",
      },
    });
  });

  test("invalid JSON is returned as a safe API error", async () => {
    const response = await fetch(`${baseUrl}/api/logistics/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const body = await json(response);

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: "INVALID_JSON",
        message: "El cuerpo JSON no es válido.",
      },
    });
  });
});

describe("AuthService", () => {
  const profile: Profile = {
    id: adminUser.id,
    full_name: adminUser.fullName,
    username: adminUser.username,
    auth_email: "internal@example.invalid",
    role: "ADMIN",
    is_active: true,
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };

  function createService(options?: {
    foundProfile?: Profile | null;
    authenticatedSession?: AuthenticatedSession | null;
    tokenUserId?: string | null;
  }) {
    const foundProfile =
      options && "foundProfile" in options ? options.foundProfile : profile;
    const authenticatedSession =
      options && "authenticatedSession" in options
        ? options.authenticatedSession
        : {
            authUserId: profile.id,
            session: loginResult.session,
          };
    const tokenUserId =
      options && "tokenUserId" in options ? options.tokenUserId : profile.id;

    const profiles: ProfilesRepository = {
      async findByUsername() {
        return foundProfile ?? null;
      },
      async findById() {
        return foundProfile ?? null;
      },
    };
    const gateway: AuthGateway = {
      async signInWithPassword(email) {
        assert.equal(email, profile.auth_email);
        return authenticatedSession ?? null;
      },
      async getUserId() {
        return tokenUserId ?? null;
      },
    };

    return new AuthService(profiles, gateway);
  }

  test("uses auth_email internally and omits it from a successful response", async () => {
    const result = await createService().login({
      username: profile.username,
      password: "request-only-password",
    });

    assert.deepEqual(result, loginResult);
    assert.equal("auth_email" in result.user, false);
  });

  test("rejects unknown and inactive profiles before issuing a session", async () => {
    await assert.rejects(
      createService({ foundProfile: null }).login({
        username: "no.existe",
        password: "incorrect",
      }),
      (error: AppError) => error.statusCode === 401
    );

    await assert.rejects(
      createService({
        foundProfile: { ...profile, is_active: false },
      }).login({
        username: profile.username,
        password: "correct",
      }),
      (error: AppError) => error.statusCode === 401
    );
  });

  test("checks is_active again for every bearer token request", async () => {
    await assert.rejects(
      createService({
        foundProfile: { ...profile, is_active: false },
      }).getCurrentUser("still-valid-token"),
      (error: AppError) =>
        error.statusCode === 403 && error.code === "ACCOUNT_INACTIVE"
    );
  });
});

describe("centralized capabilities", () => {
  test("ADMIN and MANAGER receive every capability", () => {
    assert.deepEqual(getCapabilitiesForRole("ADMIN"), [...ALL_CAPABILITIES]);
    assert.deepEqual(getCapabilitiesForRole("MANAGER"), [...ALL_CAPABILITIES]);
  });

  test("role-specific capabilities match the operational boundaries", () => {
    const waiter = getCapabilitiesForRole("WAITER");
    const cashier = getCapabilitiesForRole("CASHIER");
    const kitchen = getCapabilitiesForRole("KITCHEN");

    assert.equal(waiter.includes("orders.drinks.manage"), true);
    assert.equal(waiter.includes("payments.charge"), false);
    assert.equal(cashier.includes("payments.charge"), true);
    assert.equal(cashier.includes("cash.reconcile"), false);
    assert.equal(kitchen.includes("tables.view"), true);
    assert.equal(kitchen.includes("tables.operate"), false);
  });

  test("requireCapability passes an allowed user and returns 403 otherwise", () => {
    const middleware = requireCapability("payments.charge");
    let allowedError: unknown = "not-called";
    let deniedError: unknown;
    let unauthenticatedError: unknown;

    middleware(
      { authUser: adminUser } as Request,
      {} as Response,
      ((error?: unknown) => {
        allowedError = error;
      }) as NextFunction
    );
    middleware(
      {
        authUser: {
          ...adminUser,
          role: "WAITER",
          capabilities: getCapabilitiesForRole("WAITER"),
        },
      } as Request,
      {} as Response,
      ((error?: unknown) => {
        deniedError = error;
      }) as NextFunction
    );
    middleware(
      {} as Request,
      {} as Response,
      ((error?: unknown) => {
        unauthenticatedError = error;
      }) as NextFunction
    );

    assert.equal(allowedError, undefined);
    assert.equal(deniedError instanceof AppError, true);
    assert.equal((deniedError as AppError).statusCode, 403);
    assert.equal(unauthenticatedError instanceof AppError, true);
    assert.equal((unauthenticatedError as AppError).statusCode, 401);
  });
});
