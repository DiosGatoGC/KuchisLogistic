import { Router } from "express";
import { requireCapability } from "../../authorization/require-capability.middleware";
import { validateBody, validateParams } from "../../middlewares/validation.middleware";
import { requireAuth } from "../auth/auth.middleware";
import { requireOrderItemManageCapability } from "./order-item-capability.middleware";
import { cancelOrderItem, createSessionOrder, deliverOrderItem, getOrder, listSessionOrders, readyOrderItem, startOrderItem } from "./orders.controller";
import { cancelOrderItemSchema, createOrderSchema, orderItemParamsSchema, orderParamsSchema, sessionOrdersParamsSchema } from "./orders.schemas";

const router = Router();
router.use(requireAuth);
router.get("/sessions/:sessionId/orders", requireCapability("tables.view"), validateParams(sessionOrdersParamsSchema), listSessionOrders);
router.post("/sessions/:sessionId/orders", requireCapability("orders.create"), validateParams(sessionOrdersParamsSchema), validateBody(createOrderSchema), createSessionOrder);
router.get("/orders/:id", requireCapability("tables.view"), validateParams(orderParamsSchema), getOrder);

for (const [path, handler] of [["start", startOrderItem], ["ready", readyOrderItem], ["deliver", deliverOrderItem]] as const) {
  router.post(`/order-items/:id/${path}`, validateParams(orderItemParamsSchema), requireOrderItemManageCapability, handler);
}
router.post("/order-items/:id/cancel", requireCapability("orders.cancel"), validateParams(orderItemParamsSchema), validateBody(cancelOrderItemSchema), cancelOrderItem);

export default router;
