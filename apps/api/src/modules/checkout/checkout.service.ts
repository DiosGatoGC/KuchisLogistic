import type { Json } from "@kuchis/shared/database-types";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import { checkoutRepository, type CheckoutRepository } from "./checkout.repository";
import { checkoutPreviewRpcSchema } from "./checkout.schemas";
import type { PaymentMethod } from "./checkout.types";

function rpcObject(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(500, "PAYMENT_RESPONSE_INVALID", "El pago terminó con una respuesta inválida.");
  }
  return value;
}

function requiredString(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function requiredNumber(value: Json | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export class CheckoutService {
  constructor(private readonly checkout: CheckoutRepository) {}

  async preview(sessionId: string) {
    const value = await this.checkout.findPreview(sessionId);
    if (!value) throw new AppError(404, "SERVICE_SESSION_NOT_FOUND", "La sesión no existe.");
    const parsed = checkoutPreviewRpcSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppError(
        500,
        "CHECKOUT_RESPONSE_INVALID",
        "El checkout terminó con una respuesta inválida.",
        undefined,
        { cause: parsed.error }
      );
    }
    if (parsed.data.session.status !== "OPEN" && parsed.data.session.status !== "AWAITING_PAYMENT") {
      throw new AppError(409, "SERVICE_SESSION_NOT_ACTIVE", "La sesión no está activa.");
    }
    return parsed.data;
  }

  async pay(
    sessionId: string,
    method: PaymentMethod,
    expectedCheckoutToken: string,
    actor: AuthenticatedUser
  ) {
    const result = rpcObject(
      await this.checkout.pay(sessionId, method, expectedCheckoutToken, actor)
    );
    const paymentId = requiredString(result.paymentId);
    const resultSessionId = requiredString(result.serviceSessionId);
    const shiftId = requiredString(result.shiftId);
    const paidAt = requiredString(result.paidAt);
    const businessAmount = requiredNumber(result.businessAmount);
    const feeRate = requiredNumber(result.feeRate);
    const feeAmount = requiredNumber(result.feeAmount);
    const customerTotal = requiredNumber(result.customerTotal);
    if (
      !paymentId || !resultSessionId || resultSessionId !== sessionId || !shiftId || !paidAt ||
      businessAmount === null || feeRate === null || feeAmount === null || customerTotal === null ||
      result.method !== method || result.sessionStatus !== "PAID"
    ) {
      throw new AppError(500, "PAYMENT_RESPONSE_INVALID", "El pago terminó con una respuesta inválida.");
    }
    return {
      paymentId,
      serviceSessionId: resultSessionId,
      shiftId,
      method,
      businessAmount,
      feeRate,
      feeAmount,
      customerTotal,
      paidAt,
      sessionStatus: "PAID" as const,
    };
  }
}

export const checkoutService = new CheckoutService(checkoutRepository);
