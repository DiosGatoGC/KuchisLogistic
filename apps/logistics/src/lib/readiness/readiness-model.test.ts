import assert from "node:assert/strict";
import test from "node:test";

import { ApiError, isSessionInvalidError } from "../api/api-error.ts";
import {
  apiRequestUrl,
  validatePublicFrontendConfig,
} from "../config/public-config.ts";
import {
  LOGISTICS_SECURITY_HEADERS,
  SERVICE_WORKER_HEADERS,
} from "./security-headers.ts";

const validEnvironment = {
  NEXT_PUBLIC_LOGISTICS_API_URL: "https://api.example.com/",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
};

test("public frontend configuration accepts secure origins and normalizes them", () => {
  assert.deepEqual(validatePublicFrontendConfig(validEnvironment), {
    ok: true,
    value: {
      logisticsApiUrl: "https://api.example.com",
      supabaseUrl: "https://project.supabase.co",
      supabasePublishableKey: "publishable-key",
    },
  });
  assert.equal(
    validatePublicFrontendConfig({
      ...validEnvironment,
      NEXT_PUBLIC_LOGISTICS_API_URL: "http://localhost:3001",
    }).ok,
    true,
  );
});

test("public frontend configuration rejects missing or unsafe values", () => {
  for (const unsafeApiUrl of [
    "http://api.example.com",
    "https://api.example.com/path",
    "https://api.example.com?query=yes",
    "https://user:password@api.example.com",
    "not-a-url",
  ]) {
    assert.equal(
      validatePublicFrontendConfig({
        ...validEnvironment,
        NEXT_PUBLIC_LOGISTICS_API_URL: unsafeApiUrl,
      }).ok,
      false,
    );
  }

  assert.deepEqual(validatePublicFrontendConfig({}), {
    ok: false,
    invalidVariables: [
      "NEXT_PUBLIC_LOGISTICS_API_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ],
  });
  assert.equal(
    validatePublicFrontendConfig({
      ...validEnvironment,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_not-allowed",
    }).ok,
    false,
  );
});

test("API paths cannot escape or duplicate the configured origin", () => {
  assert.equal(
    apiRequestUrl("https://api.example.com", "/api/logistics/auth/me"),
    "https://api.example.com/api/logistics/auth/me",
  );
  assert.throws(() => apiRequestUrl("https://api.example.com", "api/logistics"));
  assert.throws(() => apiRequestUrl("https://api.example.com", "//elsewhere.test"));
});

test("only expired or disabled identities invalidate the local session", () => {
  assert.equal(isSessionInvalidError(new ApiError("unauthorized", "expired", 401)), true);
  assert.equal(
    isSessionInvalidError(
      new ApiError("forbidden", "inactive", 403, "ACCOUNT_INACTIVE"),
    ),
    true,
  );
  assert.equal(isSessionInvalidError(new ApiError("forbidden", "denied", 403)), false);
  assert.equal(isSessionInvalidError(new Error("network")), false);
});

test("defensive headers cover framing, MIME sniffing, referrers and worker updates", () => {
  assert.deepEqual(
    LOGISTICS_SECURITY_HEADERS.map(({ key }) => key),
    [
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ],
  );
  assert.equal(
    SERVICE_WORKER_HEADERS.some(
      ({ key, value }) => key === "Cache-Control" && value.includes("no-store"),
    ),
    true,
  );
});
