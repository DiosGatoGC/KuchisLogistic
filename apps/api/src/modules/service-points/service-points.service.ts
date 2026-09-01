import { AppError } from "../../errors/app-error";
import { z } from "zod";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  profilesRepository,
  type ProfilesRepository,
} from "../auth/profiles.repository";
import {
  shiftsRepository,
  type ShiftsRepository,
} from "../shifts/shifts.repository";
import {
  servicePointOccupiedError,
  servicePointsRepository,
  serviceSessionsRepository,
  type ServicePoint,
  type ServicePointsRepository,
  type ServiceSession,
  type ServiceSessionsRepository,
  type ServiceSessionReleaseRepository,
} from "./service-points.repository";
import type {
  PublicServicePoint,
  PublicServiceSession,
  ServicePointStatus,
} from "./service-points.types";

const releaseResponseSchema = z
  .object({
    serviceSessionId: z.uuid(),
    shiftId: z.uuid(),
    sessionStatus: z.literal("CANCELLED"),
    reason: z.string().min(1),
    businessAmount: z.literal(0),
    releasedAt: z.string().min(1),
    releasedBy: z.uuid(),
    releasedByRole: z.enum(["ADMIN", "MANAGER", "WAITER", "CASHIER", "KITCHEN"]),
  })
  .strict();

function toPublicPoint(point: ServicePoint): PublicServicePoint {
  return {
    id: point.id,
    name: point.name,
    type: point.type,
    sortOrder: point.sort_order,
    isActive: point.is_active,
  };
}

function bySortOrder(a: ServicePoint, b: ServicePoint) {
  return a.sort_order - b.sort_order;
}

function sessionDetail(
  session: ServiceSession,
  point: ServicePoint,
  openedBy: { id: string; fullName: string }
): PublicServiceSession {
  return {
    id: session.id,
    status: session.status,
    openedAt: session.opened_at,
    servicePoint: {
      id: point.id,
      name: point.name,
      type: point.type,
    },
    shift: { id: session.shift_id },
    openedBy: {
      id: openedBy.id,
      fullName: openedBy.fullName,
      role: session.opened_by_role,
    },
  };
}

function pointNotFound() {
  return new AppError(
    404,
    "SERVICE_POINT_NOT_FOUND",
    "El punto de servicio no existe."
  );
}

function sessionNotFound() {
  return new AppError(404, "SESSION_NOT_FOUND", "La sesión no existe.");
}

export class ServicePointsService {
  constructor(
    private readonly points: ServicePointsRepository,
    private readonly sessions: ServiceSessionsRepository,
    private readonly shifts: ShiftsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly releaseRepository: ServiceSessionReleaseRepository =
      serviceSessionsRepository
  ) {}

  async list() {
    return (await this.points.list()).sort(bySortOrder).map(toPublicPoint);
  }

  async getStatus(): Promise<ServicePointStatus[]> {
    const [points, activeSessions] = await Promise.all([
      this.points.list(),
      this.sessions.listActive(),
    ]);
    const sessionsByPoint = new Map(
      activeSessions.map((session) => [session.service_point_id, session])
    );

    return points.sort(bySortOrder).map((point) => {
      const session = sessionsByPoint.get(point.id);
      return {
        ...toPublicPoint(point),
        isOccupied: Boolean(session),
        activeSession:
          session &&
          (session.status === "OPEN" || session.status === "AWAITING_PAYMENT")
            ? {
                id: session.id,
                status: session.status,
                openedAt: session.opened_at,
              }
            : null,
      };
    });
  }

  async open(servicePointId: string, actor: AuthenticatedUser) {
    const shift = await this.shifts.findCurrent();
    if (!shift) {
      throw new AppError(
        409,
        "NO_OPEN_SHIFT",
        "No existe un turno abierto."
      );
    }

    const point = await this.points.findById(servicePointId);
    if (!point) throw pointNotFound();
    if (!point.is_active) {
      throw new AppError(
        409,
        "SERVICE_POINT_INACTIVE",
        "El punto de servicio está inactivo."
      );
    }

    if (await this.sessions.findActiveForPoint(servicePointId)) {
      throw servicePointOccupiedError();
    }

    const session = await this.sessions.create({
      service_point_id: point.id,
      shift_id: shift.id,
      opened_by: actor.id,
      opened_by_role: actor.role,
      status: "OPEN",
    });

    return sessionDetail(session, point, {
      id: actor.id,
      fullName: actor.fullName,
    });
  }

  async getSession(id: string) {
    const session = await this.sessions.findById(id);
    if (!session) throw sessionNotFound();

    const [point, profile] = await Promise.all([
      this.points.findById(session.service_point_id),
      this.profiles.findById(session.opened_by),
    ]);
    if (!point || !profile) {
      throw new AppError(
        500,
        "SESSION_RELATIONSHIP_INVALID",
        "La sesión no está configurada correctamente."
      );
    }
    return sessionDetail(session, point, {
      id: profile.id,
      fullName: profile.full_name,
    });
  }

  async awaitPayment(id: string) {
    return this.transition(id, "OPEN", "AWAITING_PAYMENT");
  }

  async reopen(id: string) {
    return this.transition(id, "AWAITING_PAYMENT", "OPEN");
  }

  async release(id: string, reason: string, actor: AuthenticatedUser) {
    const parsed = releaseResponseSchema.safeParse(
      await this.releaseRepository.release(id, reason, actor)
    );
    if (
      !parsed.success ||
      parsed.data.serviceSessionId !== id ||
      parsed.data.reason !== reason ||
      parsed.data.releasedBy !== actor.id ||
      parsed.data.releasedByRole !== actor.role
    ) {
      throw new AppError(
        500,
        "SERVICE_SESSION_RELEASE_RESPONSE_INVALID",
        "La liberación de la sesión terminó con una respuesta inválida."
      );
    }
    return parsed.data;
  }

  private async transition(
    id: string,
    from: "OPEN" | "AWAITING_PAYMENT",
    to: "OPEN" | "AWAITING_PAYMENT"
  ) {
    const current = await this.sessions.findById(id);
    if (!current) throw sessionNotFound();
    if (current.status !== from) {
      throw new AppError(
        409,
        "INVALID_SESSION_TRANSITION",
        `La sesión debe estar en estado ${from}.`
      );
    }

    const updated = await this.sessions.transition(id, from, to);
    if (!updated) {
      throw new AppError(
        409,
        "SESSION_STATE_CONFLICT",
        "La sesión cambió de estado durante la operación."
      );
    }
    return this.getSession(updated.id);
  }
}

export const servicePointsService = new ServicePointsService(
  servicePointsRepository,
  serviceSessionsRepository,
  shiftsRepository,
  profilesRepository
);
