import { z } from "zod";

export const servicePointIdParamsSchema = z.object({ id: z.uuid() }).strict();
export const serviceSessionIdParamsSchema = z
  .object({ id: z.uuid() })
  .strict();

export type ServicePointIdParams = z.infer<typeof servicePointIdParamsSchema>;
export type ServiceSessionIdParams = z.infer<
  typeof serviceSessionIdParamsSchema
>;
