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

export type ShiftIdParams = z.infer<typeof shiftIdParamsSchema>;
export type OpenShiftBody = z.infer<typeof openShiftSchema>;
