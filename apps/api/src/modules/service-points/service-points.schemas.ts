import { z } from "zod";

export const servicePointIdParamsSchema = z.object({ id: z.uuid() }).strict();
export const serviceSessionIdParamsSchema = z
  .object({ id: z.uuid() })
  .strict();

export const releaseServiceSessionSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type ServicePointIdParams = z.infer<typeof servicePointIdParamsSchema>;
export type ServiceSessionIdParams = z.infer<
  typeof serviceSessionIdParamsSchema
>;
export type ReleaseServiceSessionInput = z.infer<
  typeof releaseServiceSessionSchema
>;
