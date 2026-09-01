import { z } from "zod";

export const checkoutSessionParamsSchema = z.object({ id: z.uuid() }).strict();
export const confirmPaymentSchema = z
  .object({
    method: z.enum(["CASH", "YAPE", "CARD"]),
    expectedCheckoutToken: z.string().refine((value) => value.trim().length > 0),
  })
  .strict();

const paymentOptionSchema = z.object({
  method: z.enum(["CASH", "YAPE", "CARD"]),
  businessAmount: z.number().finite().nonnegative(),
  feeRate: z.number().finite().nonnegative(),
  feeAmount: z.number().finite().nonnegative(),
  customerTotal: z.number().finite().nonnegative(),
}).strict();

export const checkoutPreviewRpcSchema = z.object({
  session: z.object({
    id: z.uuid(),
    status: z.enum(["OPEN", "AWAITING_PAYMENT", "PAID", "CANCELLED"]),
    servicePoint: z.object({
      id: z.uuid(),
      name: z.string(),
      type: z.enum(["TABLE", "BAR", "TAKEAWAY"]),
    }).strict(),
  }).strict(),
  items: z.array(z.object({
    id: z.uuid(),
    productId: z.uuid(),
    productName: z.string(),
    unitPrice: z.number().finite().nonnegative(),
    quantity: z.number().int().positive(),
    status: z.enum(["PENDING", "PREPARING", "READY", "DELIVERED", "CANCELLED"]),
    additions: z.array(z.object({
      productId: z.uuid(),
      additionName: z.string(),
      unitPrice: z.number().finite().nonnegative(),
      quantityPerItem: z.number().int().positive(),
    }).strict()),
    lineTotal: z.number().finite().nonnegative(),
  }).strict()),
  businessAmount: z.number().finite().nonnegative(),
  paymentOptions: z.object({
    CASH: paymentOptionSchema,
    YAPE: paymentOptionSchema,
    CARD: paymentOptionSchema,
  }).strict(),
  checkoutToken: z.string().min(1),
}).strict();

export type CheckoutSessionParams = z.infer<typeof checkoutSessionParamsSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
