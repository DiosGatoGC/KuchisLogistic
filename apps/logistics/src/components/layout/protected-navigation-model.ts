export const LOGISTICS_HISTORY_KEY = "__kuchisLogisticsEntry";

export interface LogisticsHistoryEntry {
  id: string;
  pathname: string;
  previousAppEntryId: string | null;
}

export type ProtectedBackDecision =
  | { kind: "history" }
  | { kind: "fallback"; href: "/home" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readLogisticsHistoryEntry(state: unknown): LogisticsHistoryEntry | null {
  if (!isRecord(state)) return null;
  const candidate = state[LOGISTICS_HISTORY_KEY];
  if (!isRecord(candidate)) return null;

  const previousAppEntryId = candidate.previousAppEntryId;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.pathname !== "string"
    || (previousAppEntryId !== null && typeof previousAppEntryId !== "string")
  ) {
    return null;
  }

  return {
    id: candidate.id,
    pathname: candidate.pathname,
    previousAppEntryId,
  };
}

export function resolveLogisticsHistoryEntry({
  pathname,
  storedEntry,
  currentEntry,
  createId,
}: {
  pathname: string;
  storedEntry: LogisticsHistoryEntry | null;
  currentEntry: LogisticsHistoryEntry | null;
  createId: () => string;
}): LogisticsHistoryEntry {
  if (storedEntry?.pathname === pathname) return storedEntry;

  return {
    id: createId(),
    pathname,
    previousAppEntryId: currentEntry?.id ?? null,
  };
}

export function decideProtectedBack(
  entry: LogisticsHistoryEntry | null,
): ProtectedBackDecision {
  return entry?.previousAppEntryId
    ? { kind: "history" }
    : { kind: "fallback", href: "/home" };
}

export function shouldShowGlobalBack(pathname: string, suppressed: boolean) {
  const normalizedPathname = pathname.length > 1
    ? pathname.replace(/\/+$/, "")
    : pathname;
  return normalizedPathname !== "/home" && !suppressed;
}
