import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type { CancelOrderItemInput, CreateOrderInput, OrderItemParams, OrderParams, SessionOrdersParams } from "./orders.schemas";
import { ordersService } from "./orders.service";

export const listSessionOrders: RequestHandler = async (req, res, next) => {
  try {
    const { sessionId } = req.validatedParams as SessionOrdersParams;
    sendSuccess(res, await ordersService.listForSession(sessionId));
  } catch (error) { next(error); }
};

export const createSessionOrder: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { sessionId } = req.validatedParams as SessionOrdersParams;
    const order = await ordersService.create(sessionId, req.validatedBody as CreateOrderInput, req.authUser);
    sendSuccess(res, { order }, 201);
  } catch (error) { next(error); }
};

export const getOrder: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as OrderParams;
    sendSuccess(res, { order: await ordersService.get(id) });
  } catch (error) { next(error); }
};

function transition(action: "START" | "READY" | "DELIVER"): RequestHandler {
  return async (req, res, next) => {
    try {
      if (!req.authUser) throw unauthorized();
      const { id } = req.validatedParams as OrderItemParams;
      sendSuccess(res, { orderItem: await ordersService.transition(id, action, req.authUser) });
    } catch (error) { next(error); }
  };
}

export const startOrderItem = transition("START");
export const readyOrderItem = transition("READY");
export const deliverOrderItem = transition("DELIVER");

export const cancelOrderItem: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as OrderItemParams;
    const { reason } = req.validatedBody as CancelOrderItemInput;
    sendSuccess(res, { orderItem: await ordersService.cancel(id, reason, req.authUser) });
  } catch (error) { next(error); }
};
