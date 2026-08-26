import { z } from "zod";

const optionalReason = z.string().trim().min(1).max(500).optional();

export const transferSessionParamsSchema = z.object({ id: z.uuid() }).strict();
export const transferSessionSchema = z
  .object({ toServicePointId: z.uuid(), reason: optionalReason })
  .strict();
export const transferOrderItemParamsSchema = z.object({ id: z.uuid() }).strict();
export const transferOrderItemSchema = z
  .object({
    toSessionId: z.uuid(),
    quantity: z.number().int().positive().max(1000),
    reason: optionalReason,
  })
  .strict();

export type TransferSessionParams = z.infer<typeof transferSessionParamsSchema>;
export type TransferSessionInput = z.infer<typeof transferSessionSchema>;
export type TransferOrderItemParams = z.infer<typeof transferOrderItemParamsSchema>;
export type TransferOrderItemInput = z.infer<typeof transferOrderItemSchema>;
