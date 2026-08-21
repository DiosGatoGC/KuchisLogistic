import type { NextFunction, Request, Response } from "express";
import { getActiveProducts } from "../services/products.service";

export async function getProducts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const category =
      typeof req.query.category === "string"
        ? req.query.category.trim().toLowerCase()
        : undefined;

    const products = await getActiveProducts(category);

    return res.status(200).json({
      status: "ok",
      count: products.length,
      data: products,
    });
  } catch (error) {
    next(error);
  }
}