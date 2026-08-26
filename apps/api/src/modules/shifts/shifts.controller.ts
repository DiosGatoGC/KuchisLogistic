import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type { OpenShiftBody, ShiftIdParams } from "./shifts.schemas";
import { shiftsService } from "./shifts.service";

export const getCurrentShift: RequestHandler = async (_req, res, next) => {
  try {
    sendSuccess(res, { shift: await shiftsService.getCurrent() });
  } catch (error) {
    next(error);
  }
};

export const getShift: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as ShiftIdParams;
    sendSuccess(res, { shift: await shiftsService.getById(id) });
  } catch (error) {
    next(error);
  }
};

export const openShift: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { openingCash } = req.validatedBody as OpenShiftBody;
    const shift = await shiftsService.open(openingCash, req.authUser);
    sendSuccess(res, { shift }, 201);
  } catch (error) {
    next(error);
  }
};
