import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import {
  validateBody,
  validateParams,
} from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import {
  closeShift,
  getCurrentShift,
  getShift,
  getShiftClosure,
  getShiftReconciliation,
  openShift,
  reconcileShift,
} from "./shifts.controller";
import {
  closeShiftSchema,
  openShiftSchema,
  reconcileShiftSchema,
  shiftIdParamsSchema,
} from "./shifts.schemas";

const router = Router();

router.use(requireAuth);
router.get("/current", requireCapability("shift.open"), getCurrentShift);
router.post(
  "/open",
  requireCapability("shift.open"),
  validateBody(openShiftSchema),
  openShift
);
router.post(
  "/:id/close",
  requireCapability("shift.close"),
  validateParams(shiftIdParamsSchema),
  validateBody(closeShiftSchema),
  closeShift
);
router.get(
  "/:id/closure",
  requireCapability("shift.close"),
  validateParams(shiftIdParamsSchema),
  getShiftClosure
);
router.post(
  "/:id/reconciliation",
  requireCapability("cash.reconcile"),
  validateParams(shiftIdParamsSchema),
  validateBody(reconcileShiftSchema),
  reconcileShift
);
router.get(
  "/:id/reconciliation",
  requireCapability("cash.reconcile"),
  validateParams(shiftIdParamsSchema),
  getShiftReconciliation
);
router.get(
  "/:id",
  requireCapability("shift.open"),
  validateParams(shiftIdParamsSchema),
  getShift
);

export default router;
