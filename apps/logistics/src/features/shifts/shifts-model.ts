import type { Capability } from "../../types/auth.ts";
import type { Shift } from "./shifts-types.ts";

export const MAX_OPERATIONAL_AMOUNT = 99_999_999.99;

export type MoneyInputResult =
  | { valid: true; value: number }
  | { valid: false; error: string };

export function parseMoneyInput(raw: string, { allowZero }: { allowZero: boolean }): MoneyInputResult {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return { valid: false, error: "Ingresa un monto con máximo dos decimales." };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > MAX_OPERATIONAL_AMOUNT) {
    return { valid: false, error: "El monto supera el máximo permitido." };
  }
  if (allowZero ? value < 0 : value <= 0) {
    return {
      valid: false,
      error: allowZero ? "El monto no puede ser negativo." : "El monto debe ser mayor que cero.",
    };
  }
  return { valid: true, value };
}

export function shiftPermissions(capabilities: readonly Capability[]) {
  return { canOpen: capabilities.includes("shift.open") };
}

export function openingCashPayload(openingCash: number) {
  return { openingCash } as const;
}

export function isCurrentOpenShift(result: { shift: Shift | null }) {
  return result.shift?.status === "OPEN" ? result.shift : null;
}

export async function runWithShiftLock<T>(
  lock: { current: boolean },
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await operation();
  } finally {
    lock.current = false;
  }
}
