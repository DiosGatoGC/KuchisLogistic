import { apiRequest } from "@/lib/api/client";

import type {
  ReleaseServiceSessionResult,
  ServicePointStatusResult,
  ServiceSessionResult,
} from "./tables-types";

export function getServicePointStatus(accessToken: string) {
  return apiRequest<ServicePointStatusResult>(
    "/api/logistics/service-points/status",
    { accessToken },
  );
}

export function openServicePoint(servicePointId: string, accessToken: string) {
  return apiRequest<ServiceSessionResult>(
    `/api/logistics/service-points/${servicePointId}/open`,
    { method: "POST", accessToken },
  );
}

export function getServiceSession(sessionId: string, accessToken: string) {
  return apiRequest<ServiceSessionResult>(
    `/api/logistics/sessions/${sessionId}`,
    { accessToken },
  );
}

export function releaseServiceSession(
  sessionId: string,
  reason: string,
  accessToken: string,
) {
  return apiRequest<ReleaseServiceSessionResult>(
    `/api/logistics/sessions/${sessionId}/release`,
    { method: "POST", accessToken, body: { reason } },
  );
}
