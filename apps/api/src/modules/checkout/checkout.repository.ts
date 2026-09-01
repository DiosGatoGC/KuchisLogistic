import type { Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { PaymentMethod } from "./checkout.types";

export interface CheckoutRepository {
  findPreview(sessionId: string): Promise<Json | null>;
  pay(
    sessionId: string,
    method: PaymentMethod,
    expectedCheckoutToken: string,
    actor: AuthenticatedUser
  ): Promise<Json>;
}

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "CHECKOUT_PERSISTENCE_FAILED",
    "No se pudo consultar el checkout de la sesión.",
    undefined,
    { cause }
  );
}

export const checkoutRepository: CheckoutRepository = {
  async findPreview(sessionId) {
    const { data, error } = await supabaseAdmin.rpc("logistics_checkout_preview", {
      p_service_session_id: sessionId,
    });
    if (error) throw persistenceError(error);
    return data;
  },

  async pay(sessionId, method, expectedCheckoutToken, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_pay_service_session", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_expected_checkout_token: expectedCheckoutToken,
      p_method: method,
      p_service_session_id: sessionId,
    });
    if (error) throw mapRpcError(error, "SERVICE_SESSION_PAYMENT_FAILED");
    return data;
  },
};
