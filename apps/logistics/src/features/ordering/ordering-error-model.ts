export type OrderingErrorKind =
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
  PRODUCT_NOT_FOUND: "Un producto ya no existe en el catálogo.",
  PRODUCT_INACTIVE: "Un producto quedó inactivo.",
  PRODUCT_UNAVAILABLE: "Un producto ya no está disponible.",
  PRODUCT_NOT_ORDERABLE: "Un producto ya no puede pedirse como ítem principal.",
  PRODUCT_ADDITIONS_NOT_ALLOWED: "El producto ya no admite adicionales.",
  ADDITION_NOT_FOUND: "Un adicional ya no existe.",
  ADDITION_INVALID: "Uno de los adicionales ya no es válido.",
  ORDER_ITEMS_REQUIRED: "Agrega al menos un producto.",
  ORDER_ITEM_INVALID: "Una línea de la comanda no es válida.",
  ORDER_ITEM_FIELDS_INVALID: "Una línea contiene campos no permitidos.",
  ORDER_ITEM_NOTES_INVALID: "Una nota de ítem no es válida.",
  ORDER_ITEM_QUANTITY_INVALID: "Una cantidad de producto no es válida.",
  ORDER_ITEM_ADDITIONS_INVALID: "Los adicionales de una línea no son válidos.",
  ORDER_ITEM_ADDITION_INVALID: "Un adicional no es válido.",
  ORDER_ITEM_ADDITION_FIELDS_INVALID: "Un adicional contiene campos no permitidos.",
  ADDITION_QUANTITY_INVALID: "La cantidad de un adicional no es válida.",
  ADDITION_DUPLICATED: "El mismo adicional no puede repetirse en una línea.",
  SERVICE_SESSION_NOT_FOUND: "La atención ya no existe.",
  SERVICE_SESSION_NOT_OPEN: "La atención ya no está abierta.",
  SERVICE_SESSION_NOT_ACTIVE: "La atención ya no está activa.",
  SHIFT_NOT_OPEN: "El turno ya no está abierto.",
  SERVICE_SESSION_CHANGED: "La atención cambió durante el envío.",
};

export const catalogChangeCodes = new Set([
  "PRODUCT_NOT_FOUND",
  "PRODUCT_INACTIVE",
  "PRODUCT_UNAVAILABLE",
  "PRODUCT_NOT_ORDERABLE",
  "PRODUCT_ADDITIONS_NOT_ALLOWED",
  "ADDITION_NOT_FOUND",
  "ADDITION_INVALID",
]);

export const sessionChangeCodes = new Set([
  "SERVICE_SESSION_NOT_FOUND",
  "SERVICE_SESSION_NOT_OPEN",
  "SERVICE_SESSION_NOT_ACTIVE",
  "SHIFT_NOT_OPEN",
  "SERVICE_SESSION_CHANGED",
]);

export function operationalOrderingErrorMessage(
  error: { kind: OrderingErrorKind; code?: string },
  fallback = "No se pudo completar la operación.",
) {
  if (error.code && messagesByCode[error.code]) return messagesByCode[error.code];
  switch (error.kind) {
    case "unauthorized":
      return "Tu sesión ya no es válida. Inicia sesión nuevamente.";
    case "forbidden":
      return "No tienes permiso para crear comandas.";
    case "not-found":
      return "La atención o el producto ya no está disponible.";
    case "conflict":
      return "La información cambió. Revisa el catálogo y la atención.";
    case "rate-limited":
      return "Demasiadas solicitudes. Espera un momento antes de intentarlo.";
    case "network":
      return "No pudimos confirmar el resultado del envío.";
    case "server":
      return "Logistics tuvo un problema temporal.";
    case "configuration":
      return "Falta configurar la conexión con Logistics.";
    default:
      return fallback;
  }
}

