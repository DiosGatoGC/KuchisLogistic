import type { RequestHandler } from "express";
import { unauthorized } from "../../errors/app-error";
import { sendSuccess } from "../../http/responses";
import type { CheckoutSessionParams, ConfirmPaymentInput } from "./checkout.schemas";
import { checkoutService } from "./checkout.service";

export const previewCheckout: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.validatedParams as CheckoutSessionParams;
    sendSuccess(res, { checkout: await checkoutService.preview(id) });
  } catch (error) { next(error); }
};

export const confirmPayment: RequestHandler = async (req, res, next) => {
  try {
    if (!req.authUser) throw unauthorized();
    const { id } = req.validatedParams as CheckoutSessionParams;
    const { method, expectedCheckoutToken } = req.validatedBody as ConfirmPaymentInput;
    sendSuccess(
      res,
      { payment: await checkoutService.pay(id, method, expectedCheckoutToken, req.authUser) },
      201
    );
  } catch (error) { next(error); }
};
