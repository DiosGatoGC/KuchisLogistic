import type { RequestHandler } from "express";
import { sendSuccess } from "../../http/responses";
import type { HistoryPagination, HistoryShiftParams } from "./history.schemas";
import { historyService } from "./history.service";

export const listShiftHistory: RequestHandler = async (req, res, next) => {
  try {
    sendSuccess(
      res,
      await historyService.list(req.validatedQuery as HistoryPagination)
    );
  } catch (error) {
    next(error);
  }
};

export const getShiftHistory: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as HistoryShiftParams;
    sendSuccess(res, { history: await historyService.detail(id) });
  } catch (error) {
    next(error);
  }
};
