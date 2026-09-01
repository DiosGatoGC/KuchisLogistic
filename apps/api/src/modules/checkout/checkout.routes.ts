import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { confirmPayment, previewCheckout } from "./checkout.controller";
import { checkoutSessionParamsSchema, confirmPaymentSchema } from "./checkout.schemas";

const router = Router();
router.use(requireAuth);
router.get("/sessions/:id/checkout", requireCapability("tables.operate"), validateParams(checkoutSessionParamsSchema), previewCheckout);
router.post("/sessions/:id/payments", requireCapability("payments.charge"), validateParams(checkoutSessionParamsSchema), validateBody(confirmPaymentSchema), confirmPayment);

export default router;
