import type { Json } from "@kuchis/shared/database-types";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import { checkoutRepository, type CheckoutRepository } from "./checkout.repository";
import type { CheckoutAggregate, PaymentMethod } from "./checkout.types";

function toCents(value: number) {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new AppError(500, "CHECKOUT_AMOUNT_INVALID", "El checkout contiene un monto inválido.");
  }
  return cents;
}

function addMoney(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new AppError(500, "CHECKOUT_AMOUNT_INVALID", "El checkout excede el rango monetario permitido.");
  }
  return result;
}

function paymentOption(businessCents: number, method: PaymentMethod) {
  const feeRate = method === "CARD" ? 0.05 : 0;
  const feeCents = method === "CARD" ? Math.round(businessCents / 20) : 0;
  return {
    method,
    businessAmount: businessCents / 100,
    feeRate,
    feeAmount: feeCents / 100,
    customerTotal: addMoney(businessCents, feeCents) / 100,
  };
}

function checkoutPreview(aggregate: CheckoutAggregate) {
  let businessCents = 0;
  const items = aggregate.items
    .filter(
      ({ item }) =>
        item.current_service_session_id === aggregate.session.id &&
        item.status !== "CANCELLED"
    )
    .map(({ item, additions }) => {
      let additionsPerItemCents = 0;
      const publicAdditions = additions.map((addition) => {
        additionsPerItemCents = addMoney(
          additionsPerItemCents,
          toCents(addition.unit_price) * addition.quantity_per_item
        );
        return {
          productId: addition.product_id,
          additionName: addition.addition_name,
          unitPrice: addition.unit_price,
          quantityPerItem: addition.quantity_per_item,
        };
      });
      const lineCents =
        addMoney(toCents(item.unit_price), additionsPerItemCents) * item.quantity;
      if (!Number.isSafeInteger(lineCents)) {
        throw new AppError(
          500,
          "CHECKOUT_AMOUNT_INVALID",
          "El checkout excede el rango monetario permitido."
        );
      }
      businessCents = addMoney(businessCents, lineCents);
      return {
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        status: item.status,
        additions: publicAdditions,
        lineTotal: lineCents / 100,
      };
    });

  return {
    session: {
      id: aggregate.session.id,
      status: aggregate.session.status,
      servicePoint: {
        id: aggregate.servicePoint.id,
        name: aggregate.servicePoint.name,
        type: aggregate.servicePoint.type,
      },
    },
    items,
    businessAmount: businessCents / 100,
    paymentOptions: {
      CASH: paymentOption(businessCents, "CASH"),
      YAPE: paymentOption(businessCents, "YAPE"),
      CARD: paymentOption(businessCents, "CARD"),
    },
  };
}

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
    const aggregate = await this.checkout.findPreview(sessionId);
    if (!aggregate) throw new AppError(404, "SERVICE_SESSION_NOT_FOUND", "La sesión no existe.");
    if (aggregate.session.status !== "OPEN" && aggregate.session.status !== "AWAITING_PAYMENT") {
      throw new AppError(409, "SERVICE_SESSION_NOT_ACTIVE", "La sesión no está activa.");
    }
    return checkoutPreview(aggregate);
  }

  async pay(sessionId: string, method: PaymentMethod, actor: AuthenticatedUser) {
    const result = rpcObject(await this.checkout.pay(sessionId, method, actor));
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
