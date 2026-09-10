import type { ApiErrorKind } from "../../lib/api/client.ts";
import type { UserFailureKind } from "./users-attempts.ts";

const messagesByCode: Record<string, string> = {
  USERNAME_ALREADY_EXISTS: "El nombre de usuario ya está en uso.",
  USER_NOT_FOUND: "El usuario ya no existe.",
  USER_CREATION_COMPENSATION_FAILED: "La creación quedó incompleta y requiere revisión manual. No vuelvas a enviarla automáticamente.",
  ACCOUNT_INACTIVE: "La cuenta actual está inactiva. Vuelve a iniciar sesión con una cuenta habilitada.",
};

export function usersErrorMessage(
  error: { kind: ApiErrorKind; code?: string; message?: string },
  fallback = "No se pudo completar la operación de usuarios.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "Tu cuenta no tiene permiso para administrar usuarios.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  return error.message ?? fallback;
}

export function userFailureKind(error: unknown): UserFailureKind {
  const kind = typeof error === "object" && error !== null && "kind" in error
    ? error.kind
    : undefined;
  return kind === "network" || kind === "server" || kind === "unexpected"
    ? "ambiguous"
    : "other";
}
