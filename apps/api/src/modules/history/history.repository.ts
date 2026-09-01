import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../errors/app-error";
import type { HistoryPagination } from "./history.schemas";
import type {
  HistoryAdditionRow,
  HistoryAuditRow,
  HistoryClosureRow,
  HistoryDetailData,
  HistoryExpenseRow,
  HistoryItemRow,
  HistoryItemTransferRow,
  HistoryListData,
  HistoryOrderRow,
  HistoryPaymentRow,
  HistoryPointRow,
  HistoryProfileRow,
  HistoryReconciliationRow,
  HistorySessionRow,
  HistorySessionTransferRow,
  HistoryShiftRow,
} from "./history.types";

export interface HistoryRepository {
  listClosed(pagination: HistoryPagination): Promise<HistoryListData>;
  findClosedDetail(shiftId: string): Promise<HistoryDetailData | null>;
}

const shiftColumns =
  "id, opened_by, opened_by_role, closed_by, closed_by_role, opening_cash, status, opened_at, closed_at";
const closureColumns =
  "id, shift_id, closed_by, closed_by_role, business_sales_total, cash_total, yape_total, card_total, card_fee_total, customer_card_total, service_sessions_count, cancelled_sessions_count, orders_count, summary, order_items_count, product_units_count, cancelled_order_items_count, cancelled_pending_count, cancelled_preparing_count, cancelled_ready_count, cancelled_delivered_count, service_session_transfers_count, order_item_transfers_count, closing_notes, operational_expenses_count, operational_expenses_total, report_path, created_at";
const reconciliationColumns =
  "id, shift_id, reconciled_by, reconciled_by_role, opening_cash_snapshot, cash_sales_expected, cash_expenses_snapshot, expected_cash, counted_cash, cash_difference, expected_yape, confirmed_yape, yape_difference, expected_card_business, expected_card_fee, expected_card_customer_total, confirmed_card_customer_total, card_difference, notes, created_at, updated_at";
const sessionColumns =
  "id, service_point_id, shift_id, opened_by, opened_by_role, closed_by, closed_by_role, status, cancellation_reason, opened_at, closed_at";
const orderColumns =
  "id, service_session_id, sequence_number, notes, sent_at, created_by, created_by_role, created_at";
const itemColumns =
  "id, order_id, current_service_session_id, line_number, product_id, product_name, unit_price, quantity, notes, preparation_station, status, preparing_at, ready_at, delivered_at, cancelled_by, cancelled_by_role, cancelled_at, cancellation_reason, cancelled_from_status, created_at, updated_at";
const additionColumns =
  "id, order_item_id, product_id, addition_name, unit_price, quantity_per_item, created_at";
const paymentColumns =
  "id, service_session_id, shift_id, received_by, received_by_role, method, business_amount, fee_rate, fee_amount, customer_total, paid_at";
const expenseColumns =
  "id, shift_id, recorded_by, recorded_by_role, category, custom_category, description, amount, recorded_at, voided_at, voided_by, voided_by_role, void_reason";
const sessionTransferColumns =
  "id, service_session_id, from_service_point_id, from_service_point_name, to_service_point_id, to_service_point_name, transferred_by, transferred_by_role, reason, transferred_at";
const itemTransferColumns =
  "id, order_item_id, from_service_session_id, to_service_session_id, from_service_point_id, from_service_point_name, to_service_point_id, to_service_point_name, quantity, status_at_transfer, transferred_by, transferred_by_role, reason, transferred_at";
const auditColumns =
  "id, user_id, actor_role, action, entity, entity_id, shift_id, service_session_id, details, created_at";

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "HISTORY_PERSISTENCE_FAILED",
    "No se pudo consultar el historial de turnos.",
    undefined,
    { cause }
  );
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

async function loadProfiles(ids: string[]): Promise<HistoryProfileRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  if (error) throw persistenceError(error);
  return data;
}

async function loadPoints(ids: string[]): Promise<HistoryPointRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("service_points")
    .select("id, name, type")
    .in("id", ids);
  if (error) throw persistenceError(error);
  return data;
}

export const historyRepository: HistoryRepository = {
  async listClosed({ page, pageSize }) {
    const from = (page - 1) * pageSize;
    const shiftsResult = await supabaseAdmin
      .from("shifts")
      .select(shiftColumns, { count: "exact" })
      .eq("status", "CLOSED")
      .order("closed_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (shiftsResult.error) throw persistenceError(shiftsResult.error);

    const shifts = shiftsResult.data as HistoryShiftRow[];
    if (shifts.length === 0) {
      return {
        shifts: [], closures: [], reconciledShiftIds: [], profiles: [],
        total: shiftsResult.count ?? 0,
      };
    }

    const shiftIds = shifts.map((shift) => shift.id);
    const [closuresResult, reconciliationsResult] = await Promise.all([
      supabaseAdmin.from("shift_closures").select(closureColumns).in("shift_id", shiftIds),
      supabaseAdmin.from("cash_reconciliations").select("shift_id").in("shift_id", shiftIds),
    ]);
    if (closuresResult.error) throw persistenceError(closuresResult.error);
    if (reconciliationsResult.error) throw persistenceError(reconciliationsResult.error);

    const closures = closuresResult.data as HistoryClosureRow[];
    const profiles = await loadProfiles(unique([
      ...shifts.flatMap((shift) => [shift.opened_by, shift.closed_by]),
      ...closures.map((closure) => closure.closed_by),
    ]));

    return {
      shifts,
      closures,
      reconciledShiftIds: reconciliationsResult.data.map((row) => row.shift_id),
      profiles,
      total: shiftsResult.count ?? shifts.length,
    };
  },

  async findClosedDetail(shiftId) {
    const shiftResult = await supabaseAdmin
      .from("shifts")
      .select(shiftColumns)
      .eq("id", shiftId)
      .eq("status", "CLOSED")
      .maybeSingle();
    if (shiftResult.error) throw persistenceError(shiftResult.error);
    if (!shiftResult.data) return null;
    const shift = shiftResult.data as HistoryShiftRow;

    const [closureResult, reconciliationResult, sessionsResult, paymentsResult, expensesResult, auditResult] =
      await Promise.all([
        supabaseAdmin.from("shift_closures").select(closureColumns).eq("shift_id", shiftId).maybeSingle(),
        supabaseAdmin.from("cash_reconciliations").select(reconciliationColumns).eq("shift_id", shiftId).maybeSingle(),
        supabaseAdmin.from("service_sessions").select(sessionColumns).eq("shift_id", shiftId).order("opened_at", { ascending: true }),
        supabaseAdmin.from("payments").select(paymentColumns).eq("shift_id", shiftId).order("paid_at", { ascending: true }),
        supabaseAdmin.from("shift_expenses").select(expenseColumns).eq("shift_id", shiftId).order("recorded_at", { ascending: true }),
        supabaseAdmin.from("audit_logs").select(auditColumns).eq("shift_id", shiftId).order("created_at", { ascending: true }),
      ]);
    for (const result of [closureResult, reconciliationResult, sessionsResult, paymentsResult, expensesResult, auditResult]) {
      if (result.error) throw persistenceError(result.error);
    }

    const sessions = sessionsResult.data as HistorySessionRow[];
    const sessionIds = sessions.map((session) => session.id);
    let orders: HistoryOrderRow[] = [];
    let sessionTransfers: HistorySessionTransferRow[] = [];
    let itemTransfers: HistoryItemTransferRow[] = [];
    if (sessionIds.length > 0) {
      const [ordersResult, sessionTransfersResult, itemTransfersResult] = await Promise.all([
        supabaseAdmin.from("orders").select(orderColumns).in("service_session_id", sessionIds).order("sent_at", { ascending: true }),
        supabaseAdmin.from("service_session_transfers").select(sessionTransferColumns).in("service_session_id", sessionIds).order("transferred_at", { ascending: true }),
        supabaseAdmin.from("order_item_transfers").select(itemTransferColumns).in("from_service_session_id", sessionIds).order("transferred_at", { ascending: true }),
      ]);
      if (ordersResult.error) throw persistenceError(ordersResult.error);
      if (sessionTransfersResult.error) throw persistenceError(sessionTransfersResult.error);
      if (itemTransfersResult.error) throw persistenceError(itemTransfersResult.error);
      orders = ordersResult.data as HistoryOrderRow[];
      sessionTransfers = sessionTransfersResult.data as HistorySessionTransferRow[];
      itemTransfers = itemTransfersResult.data as HistoryItemTransferRow[];
    }

    let items: HistoryItemRow[] = [];
    if (orders.length > 0) {
      const itemsResult = await supabaseAdmin
        .from("order_items")
        .select(itemColumns)
        .in("order_id", orders.map((order) => order.id))
        .order("line_number", { ascending: true });
      if (itemsResult.error) throw persistenceError(itemsResult.error);
      items = itemsResult.data as HistoryItemRow[];
    }

    let additions: HistoryAdditionRow[] = [];
    if (items.length > 0) {
      const additionsResult = await supabaseAdmin
        .from("order_item_additions")
        .select(additionColumns)
        .in("order_item_id", items.map((item) => item.id));
      if (additionsResult.error) throw persistenceError(additionsResult.error);
      additions = additionsResult.data as HistoryAdditionRow[];
    }

    const closure = closureResult.data as HistoryClosureRow | null;
    const reconciliation = reconciliationResult.data as HistoryReconciliationRow | null;
    const payments = paymentsResult.data as HistoryPaymentRow[];
    const expenses = expensesResult.data as HistoryExpenseRow[];
    const audit = auditResult.data as HistoryAuditRow[];
    const actorIds = unique([
      shift.opened_by, shift.closed_by, closure?.closed_by ?? null,
      reconciliation?.reconciled_by ?? null,
      ...sessions.flatMap((row) => [row.opened_by, row.closed_by]),
      ...orders.map((row) => row.created_by), ...items.map((row) => row.cancelled_by),
      ...payments.map((row) => row.received_by),
      ...expenses.flatMap((row) => [row.recorded_by, row.voided_by]),
      ...sessionTransfers.map((row) => row.transferred_by),
      ...itemTransfers.map((row) => row.transferred_by),
      ...audit.map((row) => row.user_id),
    ]);
    const [profiles, points] = await Promise.all([
      loadProfiles(actorIds),
      loadPoints(unique(sessions.map((session) => session.service_point_id))),
    ]);

    return {
      shift, closure, reconciliation, sessions, orders, items, additions,
      payments, expenses, sessionTransfers, itemTransfers, audit, profiles, points,
    };
  },
};
