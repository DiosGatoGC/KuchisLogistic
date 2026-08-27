import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateParams, validateQuery } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { getShiftHistory, listShiftHistory } from "./history.controller";
import { historyPaginationSchema, historyShiftParamsSchema } from "./history.schemas";

const router = Router();

router.use(requireAuth);
router.get(
  "/shifts",
  requireCapability("history.view"),
  validateQuery(historyPaginationSchema),
  listShiftHistory
);
router.get(
  "/shifts/:id",
  requireCapability("history.view"),
  validateParams(historyShiftParamsSchema),
  getShiftHistory
);

export default router;
