import type { Json } from "@kuchis/shared/database-types";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import { transfersRepository, type TransfersRepository } from "./transfers.repository";
import type { TransferOrderItemInput, TransferSessionInput } from "./transfers.schemas";

function rpcObject(value: Json, code: string): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(500, code, "La transferencia terminó con una respuesta inválida.");
  }
  return value;
}

export class TransfersService {
  constructor(private readonly transfers: TransfersRepository) {}

  async transferSession(id: string, input: TransferSessionInput, actor: AuthenticatedUser) {
    const result = rpcObject(await this.transfers.transferSession(id, input, actor), "SERVICE_SESSION_TRANSFER_RESPONSE_INVALID");
    return {
      serviceSessionId: result.serviceSessionId,
      transferId: result.transferId,
      fromServicePoint: { id: result.fromServicePointId, name: result.fromServicePointName },
      toServicePoint: { id: result.toServicePointId, name: result.toServicePointName },
      transferredAt: result.transferredAt,
    };
  }

  async transferOrderItem(id: string, input: TransferOrderItemInput, actor: AuthenticatedUser) {
    const result = rpcObject(await this.transfers.transferOrderItem(id, input, actor), "ORDER_ITEM_TRANSFER_RESPONSE_INVALID");
    return {
      orderItemId: result.orderItemId,
      sourceOrderItemId: result.sourceOrderItemId,
      transferId: result.transferId,
      fromServiceSessionId: result.fromServiceSessionId,
      toServiceSessionId: result.toServiceSessionId,
      quantity: result.quantity,
      remainingQuantity: result.remainingQuantity,
      split: result.split,
      status: result.status,
    };
  }
}

export const transfersService = new TransfersService(transfersRepository);
