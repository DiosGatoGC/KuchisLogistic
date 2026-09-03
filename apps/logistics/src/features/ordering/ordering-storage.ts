import { persistedDraft } from "./ordering-model.ts";
import type { DraftOrder, PersistedDraftOrder } from "./ordering-types.ts";

const PREFIX = "kuchis:ordering-draft:v1:";

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function keyForSession(sessionId: string) {
  return `${PREFIX}${sessionId}`;
}

export function readStoredDraft(
  sessionId: string,
  storage: DraftStorage = window.sessionStorage,
): PersistedDraftOrder | null {
  try {
    const raw = storage.getItem(keyForSession(sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PersistedDraftOrder>;
    if (value.version !== 1 || !Array.isArray(value.lines) || typeof value.notes !== "string") {
      return null;
    }
    return value as PersistedDraftOrder;
  } catch {
    return null;
  }
}

export function storeDraft(
  sessionId: string,
  draft: DraftOrder,
  storage: DraftStorage = window.sessionStorage,
) {
  try {
    if (draft.lines.length === 0 && !draft.notes.trim()) {
      storage.removeItem(keyForSession(sessionId));
      return;
    }
    storage.setItem(
      keyForSession(sessionId),
      JSON.stringify(persistedDraft(draft)),
    );
  } catch {
    // El draft sigue disponible en memoria si sessionStorage no está accesible.
  }
}

export function clearStoredDraft(
  sessionId: string,
  storage: DraftStorage = window.sessionStorage,
) {
  try {
    storage.removeItem(keyForSession(sessionId));
  } catch {
    // La creación ya fue confirmada por backend; no bloqueamos la UX por storage.
  }
}
