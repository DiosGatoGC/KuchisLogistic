import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { transferOrderItem, transferSession } from "./transfers.controller";
import { transferOrderItemParamsSchema, transferOrderItemSchema, transferSessionParamsSchema, transferSessionSchema } from "./transfers.schemas";

const router = Router();
router.use(requireAuth);
router.post("/sessions/:id/transfer", requireCapability("orders.transfer"), validateParams(transferSessionParamsSchema), validateBody(transferSessionSchema), transferSession);
router.post("/order-items/:id/transfer", requireCapability("orders.transfer"), validateParams(transferOrderItemParamsSchema), validateBody(transferOrderItemSchema), transferOrderItem);

export default router;
