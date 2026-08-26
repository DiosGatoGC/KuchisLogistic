import type { Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { mapRpcError } from "../../database/rpc-errors";
import type { AuthenticatedUser } from "../auth/auth.types";
import type { TransferOrderItemInput, TransferSessionInput } from "./transfers.schemas";

export interface TransfersRepository {
  transferSession(id: string, input: TransferSessionInput, actor: AuthenticatedUser): Promise<Json>;
  transferOrderItem(id: string, input: TransferOrderItemInput, actor: AuthenticatedUser): Promise<Json>;
}

export const transfersRepository: TransfersRepository = {
  async transferSession(id, input, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_transfer_service_session", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_reason: input.reason ?? "",
      p_service_session_id: id,
      p_to_service_point_id: input.toServicePointId,
    });
    if (error) throw mapRpcError(error, "SERVICE_SESSION_TRANSFER_FAILED");
    return data;
  },

  async transferOrderItem(id, input, actor) {
    const { data, error } = await supabaseAdmin.rpc("logistics_transfer_order_item", {
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_order_item_id: id,
      p_quantity: input.quantity,
      p_reason: input.reason ?? "",
      p_to_service_session_id: input.toSessionId,
    });
    if (error) throw mapRpcError(error, "ORDER_ITEM_TRANSFER_FAILED");
    return data;
  },
};
