import { z } from "zod";

export const historyShiftParamsSchema = z.object({ id: z.uuid() }).strict();

export const historyPaginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type HistoryShiftParams = z.infer<typeof historyShiftParamsSchema>;
export type HistoryPagination = z.infer<typeof historyPaginationSchema>;
