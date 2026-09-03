export type PreparationErrorKind =
  | "bad-request"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "server"
  | "network"
  | "configuration"
  | "unexpected";

const messagesByCode: Record<string, string> = {
  ORDER_ITEM_NOT_FOUND: "El ítem ya no está en la cola.",
  ORDER_ITEM_CANCELLED: "El ítem fue cancelado.",
  ORDER_ITEM_ALREADY_CANCELLED: "El ítem ya estaba cancelado.",
  ORDER_ITEM_TRANSITION_INVALID: "Esa transición no corresponde al estado actual.",
  ORDER_ITEM_TRANSITION_NOT_ALLOWED: "El estado actual ya no permite esa acción.",
};

export const transitionConflictCodes = new Set(Object.keys(messagesByCode));

export function operationalPreparationErrorMessage(
  error: { kind: PreparationErrorKind; code?: string },
  fallback = "No se pudo completar la operación.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  switch (error.kind) {
    case "unauthorized":
      return "Tu sesión ya no es válida. Inicia sesión nuevamente.";
    case "forbidden":
      return "No tienes permiso para operar esta estación.";
    case "not-found":
    case "conflict":
      return "El ítem cambió en otro dispositivo.";
    case "rate-limited":
      return "Demasiadas solicitudes. Espera un momento antes de intentarlo.";
    case "network":
      return "No pudimos conectar con Logistics.";
    case "server":
      return "Logistics tuvo un problema temporal.";
    case "configuration":
      return "Falta configurar la conexión con Logistics.";
    default:
      return fallback;
  }
}
