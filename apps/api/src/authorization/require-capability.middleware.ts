import type { RequestHandler } from "express";
import { forbidden, unauthorized } from "../errors/app-error";
import { hasCapability, type Capability } from "./capabilities";

export function requireCapability(capability: Capability): RequestHandler {
  return (req, _res, next) => {
    if (!req.authUser) {
      next(unauthorized());
      return;
    }

    if (!hasCapability(req.authUser, capability)) {
      next(forbidden());
      return;
    }

    next();
  };
}
