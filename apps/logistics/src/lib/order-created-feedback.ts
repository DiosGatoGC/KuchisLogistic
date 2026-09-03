const STORAGE_KEY = "kuchis:order-created-feedback:v1";

export interface OrderCreatedFeedbackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function validSequenceNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function storeOrderCreatedFeedback(
  sequenceNumber: number,
  storage: OrderCreatedFeedbackStorage = window.sessionStorage,
) {
  if (!validSequenceNumber(sequenceNumber)) return false;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, sequenceNumber }),
    );
    return true;
  } catch {
    return false;
  }
}

export function consumeOrderCreatedFeedback(
  storage: OrderCreatedFeedbackStorage = window.sessionStorage,
) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    storage.removeItem(STORAGE_KEY);
    const value = JSON.parse(raw) as {
      version?: unknown;
      sequenceNumber?: unknown;
    };
    return value.version === 1 && validSequenceNumber(value.sequenceNumber)
      ? value.sequenceNumber
      : null;
  } catch {
    return null;
  }
}

export function orderCreatedMessage(sequenceNumber: number) {
  return `Comanda #${sequenceNumber} enviada.`;
}
