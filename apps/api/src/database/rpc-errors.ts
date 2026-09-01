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
  "SHIFT_EXPENSE_NOT_FOUND",
  "SHIFT_NOT_FOUND",
  "SHIFT_CLOSURE_NOT_FOUND",
  "CASH_RECONCILIATION_NOT_FOUND",
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
  "EXPENSE_CATEGORY_REQUIRED",
  "EXPENSE_DESCRIPTION_INVALID",
  "EXPENSE_AMOUNT_INVALID",
  "EXPENSE_CUSTOM_CATEGORY_REQUIRED",
  "EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED",
  "EXPENSE_VOID_REASON_REQUIRED",
  "PAYMENT_METHOD_REQUIRED",
  "CHECKOUT_TOKEN_REQUIRED",
  "SERVICE_SESSION_RELEASE_REASON_REQUIRED",
  "CLOSING_NOTES_INVALID",
  "RECONCILIATION_INPUT_INVALID",
  "RECONCILIATION_NOTES_INVALID",
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
  SHIFT_EXPENSE_NOT_FOUND: "El gasto no existe.",
  SHIFT_EXPENSE_ALREADY_VOIDED: "El gasto ya fue anulado.",
  SHIFT_EXPENSE_CHANGED: "El gasto cambió mientras se procesaba la operación.",
  EXPENSE_SHIFT_CLOSED: "No se puede anular un gasto de un turno cerrado.",
  EXPENSE_CATEGORY_REQUIRED: "La categoría del gasto es obligatoria.",
  EXPENSE_DESCRIPTION_INVALID: "La descripción del gasto no es válida.",
  EXPENSE_AMOUNT_INVALID: "El monto del gasto no es válido.",
  EXPENSE_CUSTOM_CATEGORY_REQUIRED: "La categoría personalizada es obligatoria para Otros.",
  EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED: "La categoría personalizada sólo está permitida para Otros.",
  EXPENSE_VOID_REASON_REQUIRED: "La razón de anulación es obligatoria.",
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
  PAYMENT_METHOD_REQUIRED: "El método de pago es obligatorio.",
  CHECKOUT_TOKEN_REQUIRED: "El token de checkout es obligatorio.",
  CHECKOUT_CHANGED: "La cuenta cambió. Actualiza el checkout antes de cobrar.",
  PAYMENT_ALREADY_EXISTS: "La sesión ya tiene un pago confirmado.",
  SERVICE_SESSION_NOT_AWAITING_PAYMENT: "La sesión debe estar esperando pago.",
  ORDER_ITEMS_NOT_DELIVERED: "Todos los ítems no cancelados deben estar entregados antes de cobrar.",
  NOTHING_TO_PAY: "La sesión no tiene consumo cobrable.",
  PAYMENT_AMOUNT_INVALID: "El monto calculado para el pago no es válido.",
  SERVICE_SESSION_CHANGED: "La sesión cambió mientras se procesaba la operación.",
  SERVICE_SESSION_RELEASE_REASON_REQUIRED: "La razón para liberar la sesión es obligatoria.",
  SERVICE_SESSION_HAS_BILLABLE_ITEMS: "La sesión todavía tiene consumo cobrable.",
  SERVICE_SESSION_HAS_UNCANCELLED_ITEMS: "La sesión todavía tiene ítems sin cancelar.",
  SHIFT_NOT_FOUND: "El turno no existe.",
  SHIFT_ALREADY_CLOSED: "El turno ya está cerrado.",
  SHIFT_CLOSURE_ALREADY_EXISTS: "El turno ya tiene un cierre registrado.",
  CLOSING_NOTES_INVALID: "Las notas de cierre no son válidas.",
  SHIFT_HAS_ACTIVE_SESSIONS: "El turno todavía tiene sesiones activas.",
  SHIFT_HAS_UNRESOLVED_ITEMS: "El turno todavía tiene ítems sin resolver.",
  SHIFT_PAYMENT_INCONSISTENT: "Los pagos del turno no son consistentes.",
  SHIFT_CANCELLED_SESSION_HAS_CONSUMPTION: "Una sesión cancelada conserva consumo activo.",
  SHIFT_EXPECTED_CASH_NEGATIVE: "El efectivo esperado del turno no puede ser negativo.",
  SHIFT_CLOSURE_AMOUNT_INVALID: "Los montos del cierre exceden el rango permitido.",
  SHIFT_CLOSURE_COUNT_INVALID: "Las métricas del cierre exceden el rango permitido.",
  SHIFT_CHANGED: "El turno cambió mientras se procesaba el cierre.",
  SHIFT_NOT_CLOSED: "El turno todavía no está cerrado.",
  SHIFT_CLOSURE_NOT_FOUND: "El cierre del turno no existe.",
  CASH_RECONCILIATION_ALREADY_EXISTS: "El turno ya tiene un cuadre registrado.",
  CASH_RECONCILIATION_NOT_FOUND: "El cuadre del turno no existe.",
  RECONCILIATION_INPUT_INVALID: "Los montos del cuadre no son válidos.",
  RECONCILIATION_NOTES_INVALID: "Las notas del cuadre no son válidas.",
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
