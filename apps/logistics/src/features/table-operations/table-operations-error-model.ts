export type TableOperationsErrorKind =
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
  CANCELLATION_REASON_REQUIRED: "El motivo de cancelación es obligatorio.",
  ORDER_ITEM_NOT_FOUND: "El ítem ya no existe en esta atención.",
  ORDER_ITEM_CANCELLED: "El ítem ya fue cancelado.",
  ORDER_ITEM_ALREADY_CANCELLED: "El ítem ya estaba cancelado.",
  ORDER_ITEM_CHANGED: "El ítem cambió mientras se procesaba la operación.",
  SERVICE_POINT_NOT_FOUND: "El punto de destino ya no existe.",
  SERVICE_POINT_INACTIVE: "El punto de destino está inactivo.",
  SERVICE_POINT_OCCUPIED: "El punto de destino acaba de ser ocupado.",
  SERVICE_POINT_SAME_AS_ORIGIN: "El destino debe ser distinto del origen.",
  SERVICE_SESSION_NOT_FOUND: "La atención ya no existe.",
  SERVICE_SESSION_NOT_ACTIVE: "La atención ya no está activa.",
  SERVICE_SESSION_SAME_AS_ORIGIN: "La atención de destino debe ser distinta.",
  SERVICE_SESSION_CHANGED: "La atención cambió durante la transferencia.",
  SERVICE_SESSIONS_DIFFERENT_SHIFT: "Las atenciones pertenecen a turnos distintos.",
  SHIFT_NOT_OPEN: "El turno ya no está abierto.",
  TRANSFER_QUANTITY_EXCEEDS_AVAILABLE: "La cantidad supera la disponible.",
  TRANSFER_INPUT_INVALID: "Los datos de transferencia no son válidos.",
};

export function operationalTableErrorMessage(
  error: { kind: TableOperationsErrorKind; code?: string },
  fallback = "No se pudo completar la operación.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  if (error.kind === "unauthorized") return "Tu sesión ya no es válida.";
  if (error.kind === "forbidden") return "No tienes permiso para esta operación.";
  if (error.kind === "network") return "No pudimos conectar con Logistics.";
  if (error.kind === "server") return "Logistics tuvo un problema temporal.";
  if (error.kind === "rate-limited") return "Demasiadas solicitudes. Espera un momento.";
  if (error.kind === "not-found" || error.kind === "conflict") {
    return "El estado cambió en otro dispositivo.";
  }
  return fallback;
}
