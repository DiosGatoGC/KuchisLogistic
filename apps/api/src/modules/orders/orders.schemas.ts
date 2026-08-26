import { z } from "zod";

const notesSchema = z.string().trim().min(1).max(500).optional();

const additionSchema = z
  .object({
    productId: z.uuid(),
    quantityPerItem: z.number().int().positive().max(100),
  })
  .strict();

const orderItemSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().positive().max(1000),
    notes: notesSchema,
    additions: z.array(additionSchema).max(50).default([]),
  })
  .strict();

export const createOrderSchema = z
  .object({
    notes: notesSchema,
    items: z.array(orderItemSchema).min(1).max(100),
  })
  .strict();

export const sessionOrdersParamsSchema = z
  .object({ sessionId: z.uuid() })
  .strict();
export const orderParamsSchema = z.object({ id: z.uuid() }).strict();
export const orderItemParamsSchema = z.object({ id: z.uuid() }).strict();
export const cancelOrderItemSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type SessionOrdersParams = z.infer<typeof sessionOrdersParamsSchema>;
export type OrderParams = z.infer<typeof orderParamsSchema>;
export type OrderItemParams = z.infer<typeof orderItemParamsSchema>;
export type CancelOrderItemInput = z.infer<typeof cancelOrderItemSchema>;
