import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, mock, test } from "node:test";
import app from "../app";
import { getCapabilitiesForRole, type UserRole } from "../authorization/roles";
import { authService } from "../modules/auth/auth.service";
import type { AuthenticatedUser } from "../modules/auth/auth.types";
import { usersService } from "../modules/users/users.service";
import type { UserStatusFilter } from "../modules/users/users.types";

const testId = "11111111-1111-4111-8111-111111111111";

function actor(role: UserRole): AuthenticatedUser {
  return {
    id: testId,
    fullName: "Usuario de prueba",
    username: "usuario.prueba",
    role,
    capabilities: getCapabilitiesForRole(role),
  };
}

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => mock.restoreAll());

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function authenticateAs(role: UserRole) {
  mock.method(authService, "getCurrentUser", async () => actor(role));
}

describe("iteration 2 route authorization and validation", () => {
  test("users endpoint without auth returns 401", async () => {
    const response = await fetch(`${baseUrl}/api/logistics/users`);
    assert.equal(response.status, 401);
  });

  test("a role without users.manage receives 403", async () => {
    authenticateAs("WAITER");
    const response = await fetch(`${baseUrl}/api/logistics/users`, {
      headers: { authorization: "Bearer waiter-token" },
    });
    assert.equal(response.status, 403);
  });

  test("authorized users listing passes the status filter", async () => {
    authenticateAs("ADMIN");
    mock.method(usersService, "list", async (status?: UserStatusFilter) => {
      assert.equal(status, "inactive");
      return [
        {
          id: testId,
          fullName: "Usuario inactivo",
          username: "usuario.inactivo",
          role: "WAITER" as const,
          isActive: false,
          createdAt: "2026-08-26T00:00:00.000Z",
        },
      ];
    });

    const response = await fetch(
      `${baseUrl}/api/logistics/users?status=inactive`,
      { headers: { authorization: "Bearer admin-token" } }
    );
    const body = await responseJson(response);

    assert.equal(response.status, 200);
    assert.equal(JSON.stringify(body).includes("auth_email"), false);
    assert.equal(JSON.stringify(body).includes("password"), false);
  });

  test("negative openingCash returns 400 before persistence", async () => {
    authenticateAs("CASHIER");
    const response = await fetch(`${baseUrl}/api/logistics/shifts/open`, {
      method: "POST",
      headers: {
        authorization: "Bearer cashier-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ openingCash: -1 }),
    });
    assert.equal(response.status, 400);
  });

  test("a role without shift.open receives 403", async () => {
    authenticateAs("WAITER");
    const response = await fetch(`${baseUrl}/api/logistics/shifts/open`, {
      method: "POST",
      headers: {
        authorization: "Bearer waiter-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ openingCash: 0 }),
    });
    assert.equal(response.status, 403);
  });

  test("KITCHEN can view points but cannot open one", async () => {
    authenticateAs("KITCHEN");
    const response = await fetch(
      `${baseUrl}/api/logistics/service-points/${testId}/open`,
      {
        method: "POST",
        headers: { authorization: "Bearer kitchen-token" },
      }
    );
    assert.equal(response.status, 403);
  });

  test("GET /health remains unchanged", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await responseJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.service, "kuchis-api");
  });
});
