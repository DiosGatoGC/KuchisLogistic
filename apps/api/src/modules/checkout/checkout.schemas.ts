import { z } from "zod";

export const checkoutSessionParamsSchema = z.object({ id: z.uuid() }).strict();
export const confirmPaymentSchema = z
  .object({ method: z.enum(["CASH", "YAPE", "CARD"]) })
  .strict();

export type CheckoutSessionParams = z.infer<typeof checkoutSessionParamsSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
