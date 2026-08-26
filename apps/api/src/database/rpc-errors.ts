import { AppError } from "../errors/app-error";

interface RpcErrorLike {
  code?: unknown;
  message?: unknown;
}

const notFoundCodes = new Set([
  "PRODUCT_NOT_FOUND",
  "SERVICE_POINT_NOT_FOUND",
  "SERVICE_SESSION_NOT_FOUND",
  "ORDER_ITEM_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "ADDITION_NOT_FOUND",
]);

const invalidRequestCodes = new Set([
  "ORDER_ITEMS_REQUIRED",
  "ORDER_ITEM_INVALID",
  "ORDER_ITEM_FIELDS_INVALID",
  "ORDER_ITEM_NOTES_INVALID",
  "ORDER_ITEM_QUANTITY_INVALID",
  "ORDER_ITEM_ADDITIONS_INVALID",
  "ORDER_ITEM_ADDITION_INVALID",
  "ORDER_ITEM_ADDITION_FIELDS_INVALID",
  "ADDITION_QUANTITY_INVALID",
  "ADDITION_DUPLICATED",
  "TRANSFER_INPUT_INVALID",
  "CANCELLATION_REASON_REQUIRED",
  "PRODUCT_AVAILABILITY_INPUT_INVALID",
]);

const publicMessages: Record<string, string> = {
  ACTOR_INVALID: "El usuario no puede realizar esta operación.",
  PRODUCT_NOT_FOUND: "El producto no existe.",
  PRODUCT_INACTIVE: "El producto está inactivo.",
  PRODUCT_UNAVAILABLE: "El producto no está disponible.",
  PRODUCT_NOT_ORDERABLE: "El producto no puede agregarse como ítem principal.",
  PRODUCT_ADDITIONS_NOT_ALLOWED: "El producto no admite adicionales.",
  ADDITION_NOT_FOUND: "El adicional no existe.",
  ADDITION_INVALID: "El producto seleccionado no es un adicional válido.",
  SERVICE_POINT_NOT_FOUND: "El punto de servicio no existe.",
  SERVICE_POINT_INACTIVE: "El punto de servicio está inactivo.",
  SERVICE_POINT_OCCUPIED: "El punto de servicio de destino está ocupado.",
  SERVICE_POINT_SAME_AS_ORIGIN: "El destino debe ser distinto del origen.",
  SERVICE_SESSION_NOT_FOUND: "La sesión no existe.",
  SERVICE_SESSION_NOT_OPEN: "La sesión no está abierta.",
  SERVICE_SESSION_NOT_ACTIVE: "La sesión no está activa.",
  SERVICE_SESSION_SAME_AS_ORIGIN: "La sesión de destino debe ser distinta del origen.",
  SERVICE_SESSIONS_DIFFERENT_SHIFT: "Las sesiones pertenecen a turnos distintos.",
  SHIFT_NOT_OPEN: "El turno no está abierto.",
  ORDER_ITEM_NOT_FOUND: "El ítem de comanda no existe.",
  ORDER_NOT_FOUND: "La comanda no existe.",
  ORDER_ITEM_CANCELLED: "El ítem está cancelado.",
  ORDER_ITEM_ALREADY_CANCELLED: "El ítem ya está cancelado.",
  ORDER_ITEM_TRANSITION_INVALID: "La transición solicitada no es válida.",
  ORDER_ITEM_TRANSITION_NOT_ALLOWED: "El estado actual no permite esa transición.",
  TRANSFER_QUANTITY_EXCEEDS_AVAILABLE: "La cantidad supera la disponible.",
  CANCELLATION_REASON_REQUIRED: "La razón de cancelación es obligatoria.",
};

function domainCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as RpcErrorLike;
  if (value.code !== "P0001" || typeof value.message !== "string") return null;
  const match = value.message.match(/[A-Z][A-Z_]+/);
  return match?.[0] ?? null;
}

export function mapRpcError(error: unknown, operationCode: string): AppError {
  const code = domainCode(error);

  if (!code) {
    return new AppError(
      500,
      operationCode,
      "No se pudo completar la operación logística.",
      undefined,
      { cause: error }
    );
  }

  const statusCode =
    code === "ACTOR_INVALID"
      ? 403
      : notFoundCodes.has(code)
        ? 404
        : invalidRequestCodes.has(code)
          ? 400
          : 409;

  return new AppError(
    statusCode,
    code,
    publicMessages[code] ?? "La operación no es válida en el estado actual.",
    undefined,
    { cause: error }
  );
}
