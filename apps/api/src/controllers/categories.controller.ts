import type { NextFunction, Request, Response } from "express";
import { getActiveCategories } from "../services/categories.service";

export async function getCategories(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const categories = await getActiveCategories();

    return res.status(200).json({
      status: "ok",
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}