import type { ApiErrorKind } from "../../lib/api/client.ts";
import type { PaymentFailureKind } from "./checkout-attempt.ts";

const messagesByCode: Record<string, string> = {
  CHECKOUT_CHANGED: "La cuenta cambió. Revisa el checkout actualizado antes de cobrar nuevamente.",
  SERVICE_SESSION_NOT_FOUND: "La atención ya no existe.",
  SERVICE_SESSION_NOT_ACTIVE: "La atención ya no está activa.",
  SERVICE_SESSION_NOT_AWAITING_PAYMENT: "La atención aún no está lista para cobrar.",
  SESSION_NOT_AWAITING_PAYMENT: "La atención aún no está lista para cobrar.",
  INVALID_SESSION_TRANSITION: "La atención cambió de estado antes de iniciar el cobro.",
  SESSION_STATE_CONFLICT: "La atención cambió durante la preparación del cobro.",
  SHIFT_NOT_OPEN: "El turno ya no está abierto.",
  PAYMENT_METHOD_INVALID: "El método de pago no es válido.",
  PAYMENT_RESPONSE_INVALID: "El pago devolvió una respuesta inválida.",
};

export function checkoutErrorMessage(
  error: { kind: ApiErrorKind; code?: string },
  fallback = "No se pudo completar el cobro.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "No tienes permiso para esta operación.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  if (error.kind === "not-found" || error.kind === "conflict") {
    return "El estado de la cuenta cambió.";
  }
  return fallback;
}

export function paymentFailureKind(
  error: { kind: ApiErrorKind; code?: string },
): PaymentFailureKind {
  if (error.code === "CHECKOUT_CHANGED") return "checkout-changed";
  if (error.kind === "network" || error.kind === "server") return "ambiguous";
  return "other";
}

export function sessionTransitionFailureKind(
  error: { kind: ApiErrorKind },
): "ambiguous" | "deterministic" {
  return error.kind === "network" || error.kind === "server"
    ? "ambiguous"
    : "deterministic";
}
