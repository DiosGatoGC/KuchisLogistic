import type { RequestHandler } from "express";
import { sendSuccess } from "../../http/responses";
import { preparationService } from "./preparation.service";

function queue(station: "KITCHEN" | "DRINKS"): RequestHandler {
  return async (_req, res, next) => {
    try {
      sendSuccess(res, { items: await preparationService.queue(station) });
    } catch (error) { next(error); }
  };
}

export const kitchenQueue = queue("KITCHEN");
export const drinksQueue = queue("DRINKS");
