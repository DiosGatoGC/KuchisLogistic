"use client";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { useLogisticsRealtime } from "@/features/realtime/use-logistics-realtime";
import { ApiError } from "@/lib/api/client";

import { formatOperationalDate, formatOperationalMoney, USER_ROLE_LABELS } from "../shifts/shift-formatters";
import { getShiftHistoryDetail } from "./history-api";
import {
  auditDetailEntries,
  historyDetailError,
  isValidHistoryShiftId,
  normalizeHistoryDetail,
} from "./history-model";
import type { HistoricalActor, HistoryDetail, HistoryReconciliation } from "./history-types";

function actorLabel(actor: HistoricalActor | null) {
  if (!actor) return "No disponible";
  const role = actor.role ? USER_ROLE_LABELS[actor.role] : "Rol no disponible";
  return actor.fullName ? `${actor.fullName} (perfil actual) · ${role}` : `${role} · nombre no disponible`;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

function DetailSection({ title, count, children, open = false }: { title: string; count?: number; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="history-detail-section" open={open}>
      <summary><span>{title}</span>{count !== undefined && <strong>{count}</strong>}</summary>
      <div className="history-detail-section__body">{children}</div>
    </details>
  );
}

function Reconciliation({ value }: { value: HistoryReconciliation }) {
  const rows = [
    ["Efectivo", value.expectedCash, value.countedCash, value.cashDifference],
    ["Yape", value.expectedYape, value.confirmedYape, value.yapeDifference],
    ["Tarjeta cliente", value.expectedCardCustomerTotal, value.confirmedCardCustomerTotal, value.cardDifference],
  ] as const;
  return (
    <div className="history-reconciliation">
      <div className="reconciliation-result-table">
        <div className="reconciliation-result-table__heading"><span>Canal</span><span>Esperado</span><span>Confirmado</span><span>Diferencia</span></div>
        {rows.map(([label, expected, confirmed, difference]) => (
          <div key={label}><strong>{label}</strong><span>{formatOperationalMoney(expected)}</span><span>{formatOperationalMoney(confirmed)}</span><strong data-sign={difference === 0 ? "zero" : difference > 0 ? "positive" : "negative"}>{difference > 0 ? "+" : ""}{formatOperationalMoney(difference)}</strong></div>
        ))}
      </div>
      <p>Registrado {formatOperationalDate(value.createdAt)} por {actorLabel(value.reconciledBy)}.</p>
      <p>{value.notes ?? "Sin notas de cuadre."}</p>
    </div>
  );
}

export function HistoryDetailView({ shiftId }: { shiftId: string }) {
  const { getAccessToken, logout } = useAuth();
  const [history, setHistory] = useState<HistoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const validId = isValidHistoryShiftId(shiftId);

  const loadDetail = useCallback(async () => {
    if (!validId) {
      setError({ title: "Identificador no válido", message: "El identificador del turno no tiene un formato válido." });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const response = await getShiftHistoryDetail(shiftId, accessToken);
      setHistory(normalizeHistoryDetail(response.history));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.kind === "unauthorized") {
        await logout();
        return;
      }
      setError(historyDetailError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, logout, shiftId, validId]);

  useLogisticsRealtime({
    topics: [LOGISTICS_REALTIME_TOPICS.shift, LOGISTICS_REALTIME_TOPICS.finance],
    onInvalidate: loadDetail,
    enabled: validId,
  });

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadDetail]);

  if (isLoading && !history) return <LoadingState label="Consultando detalle histórico…" />;
  if (!history) {
    return (
      <div className="history-detail-page">
        <ErrorState title={error?.title ?? "Historial no disponible"} message={error?.message ?? "No pudimos consultar este turno."} actionLabel={validId ? "Intentar nuevamente" : undefined} onAction={validId ? () => void loadDetail() : undefined} />
        <Link className="button button--secondary" href="/historial">Volver al historial</Link>
      </div>
    );
  }

  const transferCount = history.transfers.serviceSessions.length + history.transfers.orderItems.length;
  return (
    <div className="history-detail-page">
      <header className="operational-heading">
        <div><p className="eyebrow">Evidencia autoritativa</p><h1>Detalle del turno</h1><p>Cerrado {formatOperationalDate(history.shift.closedAt)}</p></div>
        <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadDetail()}>Actualizar</Button>
      </header>

      <div className="history-detail-summary">
        <Surface><span>Estado</span><strong>{history.shift.status}</strong><small>Apertura {formatOperationalDate(history.shift.openedAt)}</small><small>Cierre {formatOperationalDate(history.shift.closedAt)}</small></Surface>
        <Surface><span>Efectivo inicial</span><strong>{formatOperationalMoney(history.shift.openingCash)}</strong><small>Abrió: {actorLabel(history.shift.openedBy)}</small><small>Cerró: {actorLabel(history.shift.closedBy)}</small></Surface>
        <Surface><span>Ventas negocio</span><strong>{formatOperationalMoney(history.closure.businessSalesTotal)}</strong><small>{history.closure.serviceSessionsCount} atenciones · {history.closure.ordersCount} comandas</small></Surface>
        <Surface><span>Efectivo esperado</span><strong>{formatOperationalMoney(history.closure.expectedCashAtClose)}</strong><small>{history.reconciliation ? "Cuadre registrado" : "Sin cuadre"}</small></Surface>
      </div>

      <div className="history-detail-sections">
        <DetailSection title="Cierre" open>
          <div className="history-money-grid">
            <div><span>Ventas negocio</span><strong>{formatOperationalMoney(history.closure.businessSalesTotal)}</strong></div>
            <div><span>Efectivo</span><strong>{formatOperationalMoney(history.closure.cashTotal)}</strong></div>
            <div><span>Yape</span><strong>{formatOperationalMoney(history.closure.yapeTotal)}</strong></div>
            <div><span>Tarjeta negocio</span><strong>{formatOperationalMoney(history.closure.cardTotal)}</strong></div>
            <div><span>Comisión tarjeta</span><strong>{formatOperationalMoney(history.closure.cardFeeTotal)}</strong></div>
            <div><span>Total cliente tarjeta</span><strong>{formatOperationalMoney(history.closure.customerCardTotal)}</strong></div>
            <div><span>Gastos ({history.closure.operationalExpensesCount})</span><strong>{formatOperationalMoney(history.closure.operationalExpensesTotal)}</strong></div>
            <div><span>Efectivo esperado</span><strong>{formatOperationalMoney(history.closure.expectedCashAtClose)}</strong></div>
          </div>
          <p className="history-note">{history.closure.closingNotes ?? "Sin notas de cierre."}</p>
        </DetailSection>

        <DetailSection title="Cuadre" count={history.reconciliation ? 1 : 0} open>
          {history.reconciliation ? <Reconciliation value={history.reconciliation} /> : <p className="history-empty">Este turno no tiene cuadre registrado.</p>}
        </DetailSection>

        <DetailSection title="Atenciones y comandas" count={history.serviceSessions.length + history.orders.length}>
          {history.serviceSessions.length === 0 && history.orders.length === 0 ? <p className="history-empty">No hay atenciones ni comandas históricas.</p> : (
            <div className="history-record-list">
              {history.serviceSessions.map((session) => (
                <article key={session.id}><header><strong>{session.servicePoint.name ?? "Punto no disponible"}</strong><span>{session.status}</span></header><p>El nombre del punto refleja la configuración actual.</p><p>{formatOperationalDate(session.openedAt)} — {session.closedAt ? formatOperationalDate(session.closedAt) : "Sin cierre"}</p>{session.cancellationReason && <p>Cancelación: {session.cancellationReason}</p>}</article>
              ))}
              {history.orders.map((order) => (
                <article key={order.id}><header><strong>Comanda #{order.sequenceNumber}</strong><span>{order.items.length} ítems</span></header><p>{formatOperationalDate(order.sentAt)} · {actorLabel(order.createdBy)}</p>{order.notes && <p>Notas: {order.notes}</p>}
                  <div className="history-subrecords">{order.items.map((item) => <div key={item.id}><strong>{item.quantity} × {item.productName}</strong><span>{formatOperationalMoney(item.unitPrice)} c/u · {item.status} · {item.preparationStation}</span>{item.notes && <span>Nota: {item.notes}</span>}{item.cancellation && <span>Cancelado: {item.cancellation.reason ?? "Sin motivo disponible"}</span>}{item.additions.map((addition) => <span key={addition.id}>Adición: {addition.quantityPerItem} × {addition.additionName} · {formatOperationalMoney(addition.unitPrice)}</span>)}</div>)}</div>
                </article>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Pagos" count={history.payments.length}>
          {history.payments.length === 0 ? <p className="history-empty">No hay pagos registrados.</p> : <div className="history-record-list">{history.payments.map((payment) => <article key={payment.id}><header><strong>{payment.method}</strong><span>{formatOperationalMoney(payment.customerTotal)}</span></header><p>Negocio {formatOperationalMoney(payment.businessAmount)} · Comisión {formatOperationalMoney(payment.feeAmount)} ({formatPercent(payment.feeRate)})</p><p>{formatOperationalDate(payment.paidAt)} · {actorLabel(payment.receivedBy)}</p></article>)}</div>}
        </DetailSection>

        <DetailSection title="Gastos" count={history.expenses.length}>
          {history.expenses.length === 0 ? <p className="history-empty">No hay gastos registrados.</p> : <div className="history-record-list">{history.expenses.map((expense) => <article key={expense.id} data-voided={Boolean(expense.voidedAt)}><header><strong>{expense.customCategory ?? expense.category}</strong><span>{formatOperationalMoney(expense.amount)}</span></header><p>{expense.description}</p><p>{formatOperationalDate(expense.recordedAt)} · {actorLabel(expense.recordedBy)}</p>{expense.voidedAt && <p>Anulado {formatOperationalDate(expense.voidedAt)} · {expense.voidReason ?? "Sin motivo disponible"} · {actorLabel(expense.voidedBy)}</p>}</article>)}</div>}
        </DetailSection>

        <DetailSection title="Transferencias y correcciones" count={transferCount}>
          {transferCount === 0 ? <p className="history-empty">No hay transferencias registradas.</p> : <div className="history-record-list">
            {history.transfers.serviceSessions.map((transfer) => <article key={transfer.id}><header><strong>Atención transferida</strong><span>{formatOperationalDate(transfer.transferredAt)}</span></header><p>{transfer.fromServicePoint.name} → {transfer.toServicePoint.name}</p><p>Nombres preservados al transferir · Motivo: {transfer.reason} · {actorLabel(transfer.transferredBy)}</p></article>)}
            {history.transfers.orderItems.map((transfer) => <article key={transfer.id}><header><strong>Ítem transferido · {transfer.quantity} unidades</strong><span>{transfer.statusAtTransfer}</span></header><p>{transfer.fromServicePoint.name} → {transfer.toServicePoint.name}</p><p>Nombres preservados al transferir · Motivo: {transfer.reason} · {formatOperationalDate(transfer.transferredAt)} · {actorLabel(transfer.transferredBy)}</p></article>)}
          </div>}
        </DetailSection>

        <DetailSection title="Auditoría" count={history.audit.length}>
          {history.audit.length === 0 ? <p className="history-empty">No hay eventos de auditoría.</p> : <div className="history-record-list">{history.audit.map((entry) => <article key={entry.id}><header><strong>{entry.action}</strong><span>{entry.entity}</span></header><p>{formatOperationalDate(entry.createdAt)} · {actorLabel(entry.actor)}</p><dl className="history-audit-details">{auditDetailEntries(entry).map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></article>)}</div>}
        </DetailSection>
      </div>
    </div>
  );
}
