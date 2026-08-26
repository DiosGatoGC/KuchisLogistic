import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { getCurrentShift, getShift, openShift } from "./shifts.controller";
import { openShiftSchema, shiftIdParamsSchema } from "./shifts.schemas";

const router = Router();

router.use(requireAuth);
router.get("/current", requireCapability("shift.open"), getCurrentShift);
router.post(
  "/open",
  requireCapability("shift.open"),
  validateBody(openShiftSchema),
  openShift
);
router.get(
  "/:id",
  requireCapability("shift.open"),
  validateParams(shiftIdParamsSchema),
  getShift
);

export default router;
