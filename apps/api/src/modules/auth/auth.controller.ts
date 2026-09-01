import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type { LoginInput } from "./auth.schemas";
import { authService } from "./auth.service";

export const login: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.login(req.validatedBody as LoginInput);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = (req, res, next) => {
  if (!req.authUser) {
    next(unauthorized());
    return;
  }

  sendSuccess(res, { user: req.authUser });
};
