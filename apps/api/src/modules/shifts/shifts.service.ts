import type { AuthenticatedUser } from "../auth/auth.types";
import { AppError } from "../../errors/app-error";
import {
  shiftsRepository,
  shiftAlreadyOpenError,
  type Shift,
  type ShiftsRepository,
} from "./shifts.repository";
import type { PublicShift } from "./shifts.types";

function toPublicShift(shift: Shift): PublicShift {
  return {
    id: shift.id,
    status: shift.status,
    openingCash: shift.opening_cash,
    openedAt: shift.opened_at,
    closedAt: shift.closed_at,
    openedBy: {
      id: shift.opened_by,
      role: shift.opened_by_role,
    },
    closedBy:
      shift.closed_by && shift.closed_by_role
        ? { id: shift.closed_by, role: shift.closed_by_role }
        : null,
  };
}

export class ShiftsService {
  constructor(private readonly repository: ShiftsRepository) {}

  async getCurrent() {
    const shift = await this.repository.findCurrent();
    return shift ? toPublicShift(shift) : null;
  }

  async getById(id: string) {
    const shift = await this.repository.findById(id);
    if (!shift) {
      throw new AppError(404, "SHIFT_NOT_FOUND", "El turno no existe.");
    }
    return toPublicShift(shift);
  }

  async open(openingCash: number, actor: AuthenticatedUser) {
    if (await this.repository.findCurrent()) throw shiftAlreadyOpenError();

    const shift = await this.repository.create({
      opening_cash: openingCash,
      opened_by: actor.id,
      opened_by_role: actor.role,
      status: "OPEN",
    });
    return toPublicShift(shift);
  }
}

export const shiftsService = new ShiftsService(shiftsRepository);
