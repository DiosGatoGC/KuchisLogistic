import { ApiError, type ApiErrorKind } from "./api-error";
import {
  apiRequestUrl,
  PUBLIC_FRONTEND_CONFIG,
  publicConfigurationErrorMessage,
} from "../config/public-config";

export { ApiError, isSessionInvalidError } from "./api-error";
export type { ApiErrorKind } from "./api-error";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  accessToken?: string;
  body?: unknown;
  expectedStatus?: number;
}

function apiBaseUrl() {
  if (!PUBLIC_FRONTEND_CONFIG.ok) {
    throw new ApiError(
      "configuration",
      publicConfigurationErrorMessage(PUBLIC_FRONTEND_CONFIG),
    );
  }
  return PUBLIC_FRONTEND_CONFIG.value.logisticsApiUrl;
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return "bad-request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server";
  return "unexpected";
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  { accessToken, body, expectedStatus, headers, ...init }: ApiRequestOptions = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(apiRequestUrl(apiBaseUrl(), path), {
      ...init,
      cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "network",
      "No pudimos conectar con Logistics. Revisa tu conexión.",
    );
  }

  const payload = (await parseJson(response)) as ApiErrorBody | T | null;

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    throw new ApiError(
      kindForStatus(response.status),
      errorBody?.error?.message ?? "La solicitud no pudo completarse.",
      response.status,
      errorBody?.error?.code,
    );
  }

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new ApiError(
      "unexpected",
      "Logistics respondió con un resultado inesperado.",
      response.status,
    );
  }

  if (payload === null) {
    throw new ApiError(
      "unexpected",
      "Logistics respondió con un formato inesperado.",
      response.status,
    );
  }

  return payload as T;
}
