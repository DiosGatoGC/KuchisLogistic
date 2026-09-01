import { z } from "zod";

export const catalogQuerySchema = z
  .object({ category: z.string().trim().min(1).max(100).optional() })
  .strict();
export const catalogProductParamsSchema = z.object({ id: z.uuid() }).strict();
export const productAvailabilitySchema = z
  .object({ isAvailable: z.boolean() })
  .strict();

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type CatalogProductParams = z.infer<typeof catalogProductParamsSchema>;
export type ProductAvailabilityInput = z.infer<typeof productAvailabilitySchema>;
