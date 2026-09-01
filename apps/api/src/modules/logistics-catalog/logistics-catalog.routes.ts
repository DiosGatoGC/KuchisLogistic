import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { listCatalogCategories, listCatalogProducts, setCatalogProductAvailability } from "./logistics-catalog.controller";
import { catalogProductParamsSchema, catalogQuerySchema, productAvailabilitySchema } from "./logistics-catalog.schemas";

const router = Router();
router.use(requireAuth);
router.get("/categories", requireCapability("tables.view"), listCatalogCategories);
router.get("/products", requireCapability("tables.view"), validateQuery(catalogQuerySchema), listCatalogProducts);
router.patch("/products/:id/availability", requireCapability("catalog.availability"), validateParams(catalogProductParamsSchema), validateBody(productAvailabilitySchema), setCatalogProductAvailability);

export default router;
