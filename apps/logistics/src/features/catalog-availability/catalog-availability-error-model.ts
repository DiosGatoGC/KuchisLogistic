import type { ApiErrorKind } from "../../lib/api/client.ts";
import type { AvailabilityFailureKind } from "./catalog-availability-mutation.ts";

const messagesByCode: Record<string, string> = {
  PRODUCT_NOT_FOUND: "El producto ya no existe.",
  CATALOG_PRODUCT_NOT_FOUND: "El producto ya no existe.",
  CATALOG_RPC_RESPONSE_INVALID: "La disponibilidad cambió, pero la respuesta fue inválida.",
};

export function catalogAvailabilityErrorMessage(
  error: { kind: ApiErrorKind; code?: string },
  fallback = "No se pudo actualizar la disponibilidad.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "No tienes permiso para actualizar la carta.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  if (error.kind === "not-found" || error.kind === "conflict") {
    return "El producto cambió en otro dispositivo.";
  }
  return fallback;
}

export function availabilityFailureKind(
  error: { kind: ApiErrorKind },
): AvailabilityFailureKind {
  return error.kind === "network" || error.kind === "server" ? "ambiguous" : "other";
}
