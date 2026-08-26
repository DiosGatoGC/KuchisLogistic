import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { authService } from "./auth.service";

function extractBearerToken(authorizationHeader: string | undefined) {
  const match = authorizationHeader?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1];
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const accessToken = extractBearerToken(req.header("authorization"));

    if (!accessToken) {
      throw unauthorized();
    }

    req.authUser = await authService.getCurrentUser(accessToken);
    next();
  } catch (error) {
    next(error);
  }
};
