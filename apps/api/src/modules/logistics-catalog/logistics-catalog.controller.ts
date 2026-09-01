import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type {
  CatalogProductParams,
  CatalogQuery,
  ProductAvailabilityInput,
} from "./logistics-catalog.schemas";
import { logisticsCatalogService } from "./logistics-catalog.service";

export const listCatalogCategories: RequestHandler = async (_req, res, next) => {
  try {
    sendSuccess(res, { categories: await logisticsCatalogService.listCategories() });
  } catch (error) { next(error); }
};

export const listCatalogProducts: RequestHandler = async (req, res, next) => {
  try {
    const { category } = req.validatedQuery as CatalogQuery;
    sendSuccess(res, { products: await logisticsCatalogService.listProducts(category) });
  } catch (error) { next(error); }
};

export const setCatalogProductAvailability: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as CatalogProductParams;
    const { isAvailable } = req.validatedBody as ProductAvailabilityInput;
    sendSuccess(res, { product: await logisticsCatalogService.setAvailability(id, isAvailable, req.authUser) });
  } catch (error) { next(error); }
};
