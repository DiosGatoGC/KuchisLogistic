import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import {
  getServicePointStatus,
  listServicePoints,
  openServicePoint,
} from "./service-points.controller";
import { servicePointIdParamsSchema } from "./service-points.schemas";

const router = Router();

router.use(requireAuth);
router.get("/", requireCapability("tables.view"), listServicePoints);
router.get("/status", requireCapability("tables.view"), getServicePointStatus);
router.post(
  "/:id/open",
  requireCapability("tables.operate"),
  validateParams(servicePointIdParamsSchema),
  openServicePoint
);

export default router;
