export type TablesErrorKind =
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
  SERVICE_POINT_NOT_FOUND: "El punto de atención ya no existe.",
  SERVICE_POINT_INACTIVE: "Este punto de atención está inactivo.",
  NO_OPEN_SHIFT: "No existe un turno abierto.",
  SESSION_NOT_FOUND: "La atención ya no existe.",
  SERVICE_SESSION_NOT_FOUND: "La atención ya no existe.",
  INVALID_SESSION_TRANSITION: "La atención ya no está en el estado esperado.",
  SESSION_STATE_CONFLICT: "El estado de la atención cambió durante la operación.",
  SERVICE_SESSION_CHANGED: "El estado de la atención cambió durante la operación.",
  SERVICE_SESSION_NOT_ACTIVE: "La atención ya no está activa.",
  SERVICE_SESSION_HAS_BILLABLE_ITEMS:
    "La atención todavía tiene consumo cobrable y no puede liberarse.",
  SERVICE_SESSION_HAS_UNCANCELLED_ITEMS:
    "La atención todavía tiene ítems sin cancelar y no puede liberarse.",
  SERVICE_SESSION_RELEASE_REASON_REQUIRED:
    "El motivo de la liberación es obligatorio.",
};

export function operationalErrorMessage(
  error: { kind: TablesErrorKind; code?: string },
  fallback = "No se pudo actualizar el estado de mesas.",
) {
  if (error.code && messagesByCode[error.code]) {
    return messagesByCode[error.code];
  }

  switch (error.kind) {
    case "unauthorized":
      return "Tu sesión ya no es válida. Inicia sesión nuevamente.";
    case "forbidden":
      return "No tienes permiso para realizar esta acción.";
    case "not-found":
      return "El recurso solicitado ya no está disponible.";
    case "conflict":
      return "El estado cambió. Actualizamos la información para que puedas continuar.";
    case "rate-limited":
      return "Demasiadas solicitudes. Inténtalo nuevamente en un momento.";
    case "network":
      return "No se pudo actualizar el estado de mesas. Revisa tu conexión.";
    case "server":
      return "El servidor tuvo un problema temporal. Inténtalo nuevamente.";
    case "configuration":
      return "Falta configurar la conexión con Logistics.";
    default:
      return fallback;
  }
}
