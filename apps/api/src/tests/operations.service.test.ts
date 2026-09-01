import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getCapabilitiesForRole } from "../authorization/roles";
import { AppError } from "../errors/app-error";
import type { AuthenticatedUser } from "../modules/auth/auth.types";
import type {
  Profile,
  ProfilesRepository,
} from "../modules/auth/profiles.repository";
import type {
  ServicePoint,
  ServicePointsRepository,
  ServiceSession,
  ServiceSessionsRepository,
} from "../modules/service-points/service-points.repository";
import { ServicePointsService } from "../modules/service-points/service-points.service";
import type {
  Shift,
  ShiftsRepository,
} from "../modules/shifts/shifts.repository";
import { openShiftSchema } from "../modules/shifts/shifts.schemas";
import { ShiftsService } from "../modules/shifts/shifts.service";

const actorId = "11111111-1111-4111-8111-111111111111";
const shiftId = "22222222-2222-4222-8222-222222222222";
const pointId = "33333333-3333-4333-8333-333333333333";
const secondPointId = "44444444-4444-4444-8444-444444444444";
const sessionId = "55555555-5555-4555-8555-555555555555";

const waiter: AuthenticatedUser = {
  id: actorId,
  fullName: "Juan Mesero",
  username: "juan.mesero",
  role: "WAITER",
  capabilities: getCapabilitiesForRole("WAITER"),
};

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: shiftId,
    opened_by: actorId,
    opened_by_role: "WAITER",
    closed_by: null,
    closed_by_role: null,
    opening_cash: 0,
    status: "OPEN",
    opened_at: "2026-08-26T18:00:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

function point(overrides: Partial<ServicePoint> = {}): ServicePoint {
  return {
    id: pointId,
    name: "Mesa 1",
    type: "TABLE",
    sort_order: 1,
    is_active: true,
    ...overrides,
  };
}

function session(overrides: Partial<ServiceSession> = {}): ServiceSession {
  return {
    id: sessionId,
    service_point_id: pointId,
    shift_id: shiftId,
    opened_by: actorId,
    opened_by_role: "WAITER",
    closed_by: null,
    closed_by_role: null,
    status: "OPEN",
    cancellation_reason: null,
    opened_at: "2026-08-26T18:05:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

function actorProfile(): Profile {
  return {
    id: actorId,
    full_name: waiter.fullName,
    username: waiter.username,
    auth_email: "worker.test@users.kuchis.invalid",
    role: waiter.role,
    is_active: true,
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };
}

describe("ShiftsService", () => {
  test("accepts monetary values with at most two decimal places", () => {
    assert.equal(openShiftSchema.safeParse({ openingCash: 0.29 }).success, true);
    assert.equal(openShiftSchema.safeParse({ openingCash: 0.291 }).success, false);
  });

  test("current returns null when there is no open shift", async () => {
    const repository: ShiftsRepository = {
      async findCurrent() {
        return null;
      },
      async findById() {
        return null;
      },
      async create() {
        throw new Error("not expected");
      },
    };

    assert.equal(await new ShiftsService(repository).getCurrent(), null);
  });

  test("opens a shift with actor ID and role snapshot from auth", async () => {
    let insert: Parameters<ShiftsRepository["create"]>[0] | undefined;
    const repository: ShiftsRepository = {
      async findCurrent() {
        return null;
      },
      async findById() {
        return null;
      },
      async create(input) {
        insert = input;
        return shift({
          opening_cash: input.opening_cash,
          opened_by: input.opened_by,
          opened_by_role: input.opened_by_role,
        });
      },
    };

    const opened = await new ShiftsService(repository).open(50, waiter);
    assert.equal(opened.openingCash, 50);
    assert.equal(insert?.opened_by, waiter.id);
    assert.equal(insert?.opened_by_role, waiter.role);
    assert.equal(insert?.status, "OPEN");
  });

  test("rejects a second open shift with a domain error", async () => {
    const repository: ShiftsRepository = {
      async findCurrent() {
        return shift();
      },
      async findById() {
        return shift();
      },
      async create() {
        throw new Error("not expected");
      },
    };

    await assert.rejects(
      new ShiftsService(repository).open(0, waiter),
      (error: AppError) =>
        error.statusCode === 409 && error.code === "SHIFT_ALREADY_OPEN"
    );
  });

  test("propagates the repository's unique-conflict domain error", async () => {
    const conflict = new AppError(
      409,
      "SHIFT_ALREADY_OPEN",
      "Ya existe un turno abierto."
    );
    const repository: ShiftsRepository = {
      async findCurrent() {
        return null;
      },
      async findById() {
        return null;
      },
      async create() {
        throw conflict;
      },
    };

    await assert.rejects(
      new ShiftsService(repository).open(0, waiter),
      (error) => error === conflict
    );
  });
});

function operationsSetup(options?: {
  points?: ServicePoint[];
  sessions?: ServiceSession[];
  currentShift?: Shift | null;
}) {
  const points = [...(options?.points ?? [point()])];
  const sessions = [...(options?.sessions ?? [])];
  const currentShift =
    options && "currentShift" in options ? options.currentShift : shift();
  const calls = {
    inserts: [] as Parameters<ServiceSessionsRepository["create"]>[0][],
    transitions: [] as Array<{ id: string; from: string; to: string }>,
  };

  const pointsRepository: ServicePointsRepository = {
    async list() {
      return [...points];
    },
    async findById(id) {
      return points.find((item) => item.id === id) ?? null;
    },
  };
  const sessionsRepository: ServiceSessionsRepository = {
    async listActive() {
      return sessions.filter(
        (item) => item.status === "OPEN" || item.status === "AWAITING_PAYMENT"
      );
    },
    async findActiveForPoint(id) {
      return (
        sessions.find(
          (item) =>
            item.service_point_id === id &&
            (item.status === "OPEN" || item.status === "AWAITING_PAYMENT")
        ) ?? null
      );
    },
    async findById(id) {
      return sessions.find((item) => item.id === id) ?? null;
    },
    async create(input) {
      calls.inserts.push(input);
      const created = session({
        service_point_id: input.service_point_id,
        shift_id: input.shift_id,
        opened_by: input.opened_by,
        opened_by_role: input.opened_by_role,
        status: input.status ?? "OPEN",
      });
      sessions.push(created);
      return created;
    },
    async transition(id, from, to) {
      calls.transitions.push({ id, from, to });
      const found = sessions.find(
        (item) => item.id === id && item.status === from
      );
      if (!found) return null;
      found.status = to;
      return found;
    },
  };
  const shiftsRepository: ShiftsRepository = {
    async findCurrent() {
      return currentShift ?? null;
    },
    async findById(id) {
      return currentShift?.id === id ? currentShift : null;
    },
    async create() {
      throw new Error("not expected");
    },
  };
  const profilesRepository: ProfilesRepository = {
    async findByUsername() {
      return actorProfile();
    },
    async findById(id) {
      return id === actorId ? actorProfile() : null;
    },
  };

  return {
    service: new ServicePointsService(
      pointsRepository,
      sessionsRepository,
      shiftsRepository,
      profilesRepository
    ),
    calls,
  };
}

describe("ServicePointsService", () => {
  test("returns service points ordered by sortOrder", async () => {
    const { service } = operationsSetup({
      points: [
        point({ id: secondPointId, name: "Mesa 2", sort_order: 2 }),
        point({ sort_order: 1 }),
      ],
    });
    assert.deepEqual(
      (await service.list()).map((item) => item.sortOrder),
      [1, 2]
    );
  });

  test("derives free and occupied status from active sessions", async () => {
    const { service } = operationsSetup({
      points: [point(), point({ id: secondPointId, sort_order: 2 })],
      sessions: [session()],
    });
    const status = await service.getStatus();

    assert.equal(status[0]?.isOccupied, true);
    assert.equal(status[0]?.activeSession?.id, sessionId);
    assert.equal(status[1]?.isOccupied, false);
    assert.equal(status[1]?.activeSession, null);
  });

  test("cannot open a point without an open shift", async () => {
    const { service } = operationsSetup({ currentShift: null });
    await assert.rejects(
      service.open(pointId, waiter),
      (error: AppError) => error.code === "NO_OPEN_SHIFT"
    );
  });

  test("cannot open an inactive point", async () => {
    const { service } = operationsSetup({
      points: [point({ is_active: false })],
    });
    await assert.rejects(
      service.open(pointId, waiter),
      (error: AppError) => error.code === "SERVICE_POINT_INACTIVE"
    );
  });

  test("opens a point under the current shift with auth actor snapshots", async () => {
    const { service, calls } = operationsSetup();
    const opened = await service.open(pointId, waiter);

    assert.equal(opened.shift.id, shiftId);
    assert.equal(opened.openedBy.id, waiter.id);
    assert.equal(opened.openedBy.role, waiter.role);
    assert.equal(calls.inserts[0]?.shift_id, shiftId);
    assert.equal(calls.inserts[0]?.opened_by, waiter.id);
    assert.equal(calls.inserts[0]?.opened_by_role, waiter.role);
  });

  test("rejects double opening with a clean domain error", async () => {
    const { service } = operationsSetup({ sessions: [session()] });
    await assert.rejects(
      service.open(pointId, waiter),
      (error: AppError) => error.code === "SERVICE_POINT_OCCUPIED"
    );
  });

  test("propagates the final unique-conflict if another device wins the race", async () => {
    const occupied = new AppError(
      409,
      "SERVICE_POINT_OCCUPIED",
      "El punto de servicio ya tiene una sesión activa."
    );
    const sessionsRepository: ServiceSessionsRepository = {
      async listActive() {
        return [];
      },
      async findActiveForPoint() {
        return null;
      },
      async findById() {
        return null;
      },
      async create() {
        throw occupied;
      },
      async transition() {
        return null;
      },
    };
    const pointsRepository: ServicePointsRepository = {
      async list() {
        return [point()];
      },
      async findById() {
        return point();
      },
    };
    const shiftsRepository: ShiftsRepository = {
      async findCurrent() {
        return shift();
      },
      async findById() {
        return shift();
      },
      async create() {
        throw new Error("not expected");
      },
    };
    const profilesRepository: ProfilesRepository = {
      async findByUsername() {
        return actorProfile();
      },
      async findById() {
        return actorProfile();
      },
    };
    await assert.rejects(
      new ServicePointsService(
        pointsRepository,
        sessionsRepository,
        shiftsRepository,
        profilesRepository
      ).open(pointId, waiter),
      (error) => error === occupied
    );
  });

  test("returns session detail with point, shift, and role snapshot", async () => {
    const { service } = operationsSetup({ sessions: [session()] });
    const detail = await service.getSession(sessionId);

    assert.equal(detail.servicePoint.name, "Mesa 1");
    assert.equal(detail.shift.id, shiftId);
    assert.deepEqual(detail.openedBy, {
      id: actorId,
      fullName: waiter.fullName,
      role: "WAITER",
    });
  });

  test("supports only OPEN → AWAITING_PAYMENT → OPEN", async () => {
    const { service, calls } = operationsSetup({ sessions: [session()] });
    assert.equal((await service.awaitPayment(sessionId)).status, "AWAITING_PAYMENT");
    assert.equal((await service.reopen(sessionId)).status, "OPEN");
    assert.deepEqual(calls.transitions, [
      { id: sessionId, from: "OPEN", to: "AWAITING_PAYMENT" },
      { id: sessionId, from: "AWAITING_PAYMENT", to: "OPEN" },
    ]);
  });

  test("rejects invalid session transitions", async () => {
    const { service } = operationsSetup({
      sessions: [session({ status: "PAID" })],
    });
    await assert.rejects(
      service.reopen(sessionId),
      (error: AppError) => error.code === "INVALID_SESSION_TRANSITION"
    );
  });
});
