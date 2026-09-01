import { z } from "zod";

const moneySchema = z
  .number()
  .finite()
  .positive()
  .max(99_999_999.99)
  .refine((value) => Number(value.toFixed(2)) === value, {
    message: "amount debe tener como máximo dos decimales.",
  });

export const expenseParamsSchema = z.object({ id: z.uuid() }).strict();

export const recordExpenseSchema = z
  .object({
    category: z.enum(["SUPPLIES", "CLEANING", "OTHER"]),
    customCategory: z.string().trim().min(1).max(80).nullable().optional(),
    description: z.string().trim().min(1).max(300),
    amount: moneySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.category === "OTHER" && !value.customCategory) {
      context.addIssue({
        code: "custom",
        path: ["customCategory"],
        message: "customCategory es obligatorio para OTHER.",
      });
    }
    if (value.category !== "OTHER" && value.customCategory != null) {
      context.addIssue({
        code: "custom",
        path: ["customCategory"],
        message: "customCategory sólo está permitido para OTHER.",
      });
    }
  });

export const voidExpenseSchema = z
  .object({ reason: z.string().trim().min(1).max(300) })
  .strict();

export type ExpenseParams = z.infer<typeof expenseParamsSchema>;
export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;
export type VoidExpenseInput = z.infer<typeof voidExpenseSchema>;
