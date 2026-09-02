import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { operationalErrorMessage } from "./tables-error-model.ts";
import {
  arrangeDiningPoints,
  interactionForPoint,
  statusForPoint,
  validateReleaseReason,
} from "./tables-model.ts";
import type { ServicePointStatus } from "./tables-types.ts";

function point(
  overrides: Partial<ServicePointStatus> = {},
): ServicePointStatus {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Mesa 1",
    type: "TABLE",
    sortOrder: 1,
    isActive: true,
    isOccupied: false,
    activeSession: null,
    ...overrides,
  };
}

describe("tables model", () => {
  test("maps free, open, awaiting payment and inactive states", () => {
    assert.equal(statusForPoint(point()), "available");
    assert.equal(
      statusForPoint(
        point({
          isOccupied: true,
          activeSession: {
            id: "00000000-0000-4000-8000-000000000002",
            status: "OPEN",
            openedAt: "2026-09-02T20:00:00.000Z",
          },
        }),
      ),
      "open",
    );
    assert.equal(
      statusForPoint(
        point({
          isOccupied: true,
          activeSession: {
            id: "00000000-0000-4000-8000-000000000002",
            status: "AWAITING_PAYMENT",
            openedAt: "2026-09-02T20:00:00.000Z",
          },
        }),
      ),
      "payment",
    );
    assert.equal(statusForPoint(point({ isActive: false })), "inactive");
  });

  test("keeps read-only users out of open while allowing occupied detail", () => {
    assert.equal(interactionForPoint(point(), false), "none");
    assert.equal(interactionForPoint(point(), true), "open");
    assert.equal(
      interactionForPoint(
        point({
          isOccupied: true,
          activeSession: {
            id: "00000000-0000-4000-8000-000000000002",
            status: "OPEN",
            openedAt: "2026-09-02T20:00:00.000Z",
          },
        }),
        false,
      ),
      "view",
    );
    assert.equal(
      interactionForPoint(point({ isActive: false }), true),
      "none",
    );
  });

  test("preserves the approved dining-room order", () => {
    const names = [
      "Mesa 1",
      "B1",
      "Mesa 7",
      "Mesa 3",
      "B4",
      "Mesa 6",
      "Mesa 2",
      "B2",
      "Mesa 5",
      "B3",
      "Mesa 4",
    ];
    const arranged = arrangeDiningPoints(
      names.map((name, index) =>
        point({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          name,
          type: name.startsWith("B") ? "BAR" : "TABLE",
          sortOrder: index + 1,
        }),
      ),
    );
    assert.deepEqual(
      arranged.map(({ name }) => name),
      [
        "Mesa 6",
        "Mesa 5",
        "Mesa 4",
        "Mesa 3",
        "Mesa 2",
        "Mesa 1",
        "Mesa 7",
        "B4",
        "B3",
        "B2",
        "B1",
      ],
    );
  });

  test("trims and validates the release reason", () => {
    assert.equal(validateReleaseReason("   ").error, "Escribe el motivo de la liberación.");
    assert.equal(validateReleaseReason(" x ").reason, "x");
    assert.equal(validateReleaseReason("x".repeat(501)).error, "El motivo no puede superar los 500 caracteres.");
    assert.equal(validateReleaseReason("Atención abierta por error").error, null);
  });

  test("maps concurrency, shift and generic operational errors", () => {
    assert.equal(
      operationalErrorMessage({ kind: "conflict", code: "NO_OPEN_SHIFT" }),
      "No existe un turno abierto.",
    );
    assert.equal(
      operationalErrorMessage({ kind: "conflict", code: "SESSION_STATE_CONFLICT" }),
      "El estado de la atención cambió durante la operación.",
    );
    assert.equal(
      operationalErrorMessage({ kind: "rate-limited" }),
      "Demasiadas solicitudes. Inténtalo nuevamente en un momento.",
    );
    assert.equal(
      operationalErrorMessage({ kind: "network" }),
      "No se pudo actualizar el estado de mesas. Revisa tu conexión.",
    );
  });
});
