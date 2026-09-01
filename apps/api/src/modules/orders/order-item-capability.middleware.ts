import type { RequestHandler } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { AppError } from "../../errors/app-error";
import type { OrderItemParams } from "./orders.schemas";
import { ordersRepository } from "./orders.repository";

export const requireOrderItemManageCapability: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as OrderItemParams;
    const item = await ordersRepository.findItem(id);
    if (!item) throw new AppError(404, "ORDER_ITEM_NOT_FOUND", "El ítem de comanda no existe.");
    const capability = item.preparation_station === "KITCHEN"
      ? "orders.kitchen.manage" as const
      : "orders.drinks.manage" as const;
    requireCapability(capability)(req, res, next);
  } catch (error) {
    next(error);
  }
};
