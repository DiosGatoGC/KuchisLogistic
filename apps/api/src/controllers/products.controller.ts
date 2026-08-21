import type { NextFunction, Request, Response } from "express";
import { getActiveProducts } from "../services/products.service";

export async function getProducts(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const products = await getActiveProducts();

    return res.status(200).json({
      status: "ok",
      count: products.length,
      data: products,
    });
  } catch (error) {
    next(error);
  }
}