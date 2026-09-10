import { apiRequest } from "@/lib/api/client";

import { historyListPath } from "./history-model";
import type { HistoryDetailResult, HistoryListResult } from "./history-types";

export function getShiftHistoryList(page: number, pageSize: number, accessToken: string) {
  return apiRequest<HistoryListResult>(historyListPath(page, pageSize), { accessToken });
}

export function getShiftHistoryDetail(shiftId: string, accessToken: string) {
  return apiRequest<HistoryDetailResult>(
    `/api/logistics/history/shifts/${encodeURIComponent(shiftId)}`,
    { accessToken },
  );
}
