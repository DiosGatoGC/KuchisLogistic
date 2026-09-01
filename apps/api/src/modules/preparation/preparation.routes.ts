import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { drinksQueue, kitchenQueue } from "./preparation.controller";

const router = Router();
router.use(requireAuth);
router.get("/kitchen", requireCapability("orders.kitchen.view"), kitchenQueue);
router.get("/drinks", requireCapability("orders.drinks.view"), drinksQueue);

export default router;
