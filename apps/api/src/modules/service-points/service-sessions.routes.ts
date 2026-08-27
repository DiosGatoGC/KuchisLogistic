import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import {
  awaitSessionPayment,
  getServiceSession,
  releaseServiceSession,
  reopenSession,
} from "./service-points.controller";
import {
  releaseServiceSessionSchema,
  serviceSessionIdParamsSchema,
} from "./service-points.schemas";

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
router.post(
  "/:id/release",
  requireCapability("tables.release"),
  validateParams(serviceSessionIdParamsSchema),
  validateBody(releaseServiceSessionSchema),
  releaseServiceSession
);

export default router;
