import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type { TransferOrderItemInput, TransferOrderItemParams, TransferSessionInput, TransferSessionParams } from "./transfers.schemas";
import { transfersService } from "./transfers.service";

export const transferSession: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as TransferSessionParams;
    const transfer = await transfersService.transferSession(id, req.validatedBody as TransferSessionInput, req.authUser);
    sendSuccess(res, { transfer });
  } catch (error) { next(error); }
};

export const transferOrderItem: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as TransferOrderItemParams;
    const transfer = await transfersService.transferOrderItem(id, req.validatedBody as TransferOrderItemInput, req.authUser);
    sendSuccess(res, { transfer });
  } catch (error) { next(error); }
};
