import type { ApiErrorKind } from "../../lib/api/client.ts";
import type { ShiftMutationFailureKind } from "./shift-opening-attempt.ts";

const messagesByCode: Record<string, string> = {
  SHIFT_ALREADY_OPEN: "Ya existe un turno abierto.",
  SHIFTS_PERSISTENCE_FAILED: "No pudimos consultar el turno actual.",
};

export function shiftErrorMessage(
  error: { kind: ApiErrorKind; code?: string },
  fallback = "No se pudo completar la operación de turno.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "No tienes permiso para operar turnos.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  return fallback;
}

export function shiftMutationFailureKind(
  error: { kind: ApiErrorKind },
): ShiftMutationFailureKind {
  return error.kind === "network" || error.kind === "server" ? "ambiguous" : "other";
}
