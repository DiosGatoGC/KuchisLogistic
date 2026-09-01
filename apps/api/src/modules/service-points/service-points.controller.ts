import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type {
  ServicePointIdParams,
  ServiceSessionIdParams,
  ReleaseServiceSessionInput,
} from "./service-points.schemas";
import { servicePointsService } from "./service-points.service";

export const listServicePoints: RequestHandler = async (_req, res, next) => {
  try {
    sendSuccess(res, { servicePoints: await servicePointsService.list() });
  } catch (error) {
    next(error);
  }
};

export const getServicePointStatus: RequestHandler = async (
  _req,
  res,
  next
) => {
  try {
    sendSuccess(res, { servicePoints: await servicePointsService.getStatus() });
  } catch (error) {
    next(error);
  }
};

export const openServicePoint: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as ServicePointIdParams;
    const session = await servicePointsService.open(id, req.authUser);
    sendSuccess(res, { session }, 201);
  } catch (error) {
    next(error);
  }
};

export const getServiceSession: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as ServiceSessionIdParams;
    sendSuccess(res, { session: await servicePointsService.getSession(id) });
  } catch (error) {
    next(error);
  }
};

function transitionSession(
  transition: (id: string) => Promise<unknown>
): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id } = req.validatedParams as ServiceSessionIdParams;
      sendSuccess(res, { session: await transition(id) });
    } catch (error) {
      next(error);
    }
  };
}

export const awaitSessionPayment = transitionSession((id) =>
  servicePointsService.awaitPayment(id)
);
export const reopenSession = transitionSession((id) =>
  servicePointsService.reopen(id)
);

export const releaseServiceSession: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as ServiceSessionIdParams;
    const { reason } = req.validatedBody as ReleaseServiceSessionInput;
    sendSuccess(res, {
      session: await servicePointsService.release(id, reason, req.authUser),
    });
  } catch (error) {
    next(error);
  }
};
