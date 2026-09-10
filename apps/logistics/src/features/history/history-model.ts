import type { Capability } from "../../types/auth.ts";
import type {
  HistoryAuditEntry,
  HistoryDetail,
  HistoryListResult,
  HistoryPagination,
} from "./history-types.ts";

export const HISTORY_PAGE_SIZE = 20;

export function historyPermissions(capabilities: readonly Capability[]) {
  return { canView: capabilities.includes("history.view") };
}

export function normalizeHistoryPage(value: number) {
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

export function normalizeHistoryPageSize(value: number) {
  if (!Number.isInteger(value)) return HISTORY_PAGE_SIZE;
  return Math.min(100, Math.max(1, value));
}

export function historyListPath(page: number, pageSize: number) {
  const query = new URLSearchParams({
    page: String(normalizeHistoryPage(page)),
    pageSize: String(normalizeHistoryPageSize(pageSize)),
  });
  return `/api/logistics/history/shifts?${query.toString()}`;
}

export function normalizeHistoryList(result: HistoryListResult): HistoryListResult {
  return {
    items: result.items.map((item) => ({ ...item })),
    pagination: { ...result.pagination },
  };
}

export function safeHistoryPage(pagination: HistoryPagination) {
  if (pagination.total === 0) return 1;
  return Math.max(1, Math.min(pagination.page, pagination.totalPages));
}

export function isValidHistoryShiftId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeHistoryDetail(result: HistoryDetail): HistoryDetail {
  return {
    ...result,
    shift: { ...result.shift },
    closure: { ...result.closure },
    reconciliation: result.reconciliation ? { ...result.reconciliation } : null,
    serviceSessions: result.serviceSessions.map((session) => ({
      ...session,
      servicePoint: { ...session.servicePoint },
    })),
    orders: result.orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        cancellation: item.cancellation ? { ...item.cancellation } : null,
        additions: item.additions.map((addition) => ({ ...addition })),
      })),
    })),
    payments: result.payments.map((payment) => ({ ...payment })),
    expenses: result.expenses.map((expense) => ({ ...expense })),
    transfers: {
      serviceSessions: result.transfers.serviceSessions.map((transfer) => ({
        ...transfer,
        fromServicePoint: { ...transfer.fromServicePoint },
        toServicePoint: { ...transfer.toServicePoint },
      })),
      orderItems: result.transfers.orderItems.map((transfer) => ({
        ...transfer,
        fromServicePoint: { ...transfer.fromServicePoint },
        toServicePoint: { ...transfer.toServicePoint },
      })),
    },
    audit: result.audit.map((entry) => ({ ...entry })),
  };
}

export function historyDetailError(error: unknown) {
  if (
    typeof error === "object" && error !== null && "code" in error
    && (error as { code?: string }).code === "SHIFT_HISTORY_NOT_FOUND"
  ) {
    return {
      title: "Turno no encontrado",
      message: "El turno cerrado solicitado no existe o ya no está disponible.",
    };
  }
  return {
    title: "Historial no disponible",
    message: "No pudimos consultar el detalle histórico.",
  };
}

export function auditDetailEntries(entry: Pick<HistoryAuditEntry, "details">) {
  if (!entry.details || typeof entry.details !== "object" || Array.isArray(entry.details)) {
    return [] as { label: string; value: string }[];
  }
  return Object.entries(entry.details as Record<string, unknown>).map(([label, value]) => ({
    label,
    value: value === null
      ? "Sin valor"
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : Array.isArray(value)
          ? `${value.length} elementos`
          : "Información estructurada",
  }));
}
