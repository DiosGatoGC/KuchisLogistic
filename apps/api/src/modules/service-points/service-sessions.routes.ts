import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import {
  awaitSessionPayment,
  getServiceSession,
  reopenSession,
} from "./service-points.controller";
import { serviceSessionIdParamsSchema } from "./service-points.schemas";

const router = Router();

router.use(requireAuth);
router.get(
  "/:id",
  requireCapability("tables.view"),
  validateParams(serviceSessionIdParamsSchema),
  getServiceSession
);
router.post(
  "/:id/await-payment",
  requireCapability("tables.operate"),
  validateParams(serviceSessionIdParamsSchema),
  awaitSessionPayment
);
router.post(
  "/:id/reopen",
  requireCapability("tables.operate"),
  validateParams(serviceSessionIdParamsSchema),
  reopenSession
);

export default router;
