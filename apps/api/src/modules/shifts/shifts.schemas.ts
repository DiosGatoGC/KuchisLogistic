import { z } from "zod";

export const shiftIdParamsSchema = z.object({ id: z.uuid() }).strict();

export const openShiftSchema = z
  .object({
    openingCash: z
      .number()
      .finite()
      .nonnegative()
      .max(99_999_999.99)
      .refine((value) => Number(value.toFixed(2)) === value, {
        message: "openingCash debe tener como máximo dos decimales.",
      }),
  })
  .strict();

const optionalNotesSchema = z.string().trim().min(1).max(500).nullable().optional();

const reconciliationAmountSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(99_999_999.99)
  .refine((value) => Number(value.toFixed(2)) === value, {
    message: "El monto debe tener como máximo dos decimales.",
  });

export const closeShiftSchema = z
  .object({ closingNotes: optionalNotesSchema })
  .strict();

export const reconcileShiftSchema = z
  .object({
    countedCash: reconciliationAmountSchema,
    confirmedYape: reconciliationAmountSchema,
    confirmedCardCustomerTotal: reconciliationAmountSchema,
    notes: optionalNotesSchema,
  })
  .strict();

export type ShiftIdParams = z.infer<typeof shiftIdParamsSchema>;
export type OpenShiftBody = z.infer<typeof openShiftSchema>;
export type CloseShiftBody = z.infer<typeof closeShiftSchema>;
export type ReconcileShiftBody = z.infer<typeof reconcileShiftSchema>;
