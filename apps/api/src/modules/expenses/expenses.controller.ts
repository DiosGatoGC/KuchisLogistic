import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type { ExpenseParams, RecordExpenseInput, VoidExpenseInput } from "./expenses.schemas";
import { expensesService } from "./expenses.service";

export const listCurrentExpenses: RequestHandler = async (_req, res, next) => {
  try {
    sendSuccess(res, await expensesService.current());
  } catch (error) { next(error); }
};

export const getExpense: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as ExpenseParams;
    sendSuccess(res, { expense: await expensesService.get(id) });
  } catch (error) { next(error); }
};

export const recordExpense: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const expense = await expensesService.record(
      req.validatedBody as RecordExpenseInput,
      req.authUser
    );
    sendSuccess(res, { expense }, 201);
  } catch (error) { next(error); }
};

export const voidExpense: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as ExpenseParams;
    const { reason } = req.validatedBody as VoidExpenseInput;
    sendSuccess(res, { expense: await expensesService.void(id, reason, req.authUser) });
  } catch (error) { next(error); }
};
