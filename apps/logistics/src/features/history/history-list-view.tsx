"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";

import { formatOperationalDate, formatOperationalMoney, USER_ROLE_LABELS } from "../shifts/shift-formatters";
import { getShiftHistoryList } from "./history-api";
import {
  HISTORY_PAGE_SIZE,
  normalizeHistoryList,
  safeHistoryPage,
} from "./history-model";
import type { HistoricalActor, HistoryListResult } from "./history-types";

function actorLabel(actor: HistoricalActor | null) {
  if (!actor) return "No disponible";
  const role = actor.role ? USER_ROLE_LABELS[actor.role] : "Rol no disponible";
  return actor.fullName ? `${actor.fullName} · ${role}` : role;
}

export function HistoryListView() {
  const { getAccessToken, logout } = useAuth();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryListResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadHistory = useCallback(async (requestedPage: number) => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const response = normalizeHistoryList(
        await getShiftHistoryList(requestedPage, HISTORY_PAGE_SIZE, accessToken),
      );
      if (requestId !== requestRef.current) return;
      const recoveredPage = safeHistoryPage(response.pagination);
      if (response.pagination.total > 0 && recoveredPage !== requestedPage) {
        setPage(recoveredPage);
        return;
      }
      setResult(response);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      if (error instanceof ApiError && error.kind === "unauthorized") {
        await logout();
        return;
      }
      setErrorMessage(
        error instanceof ApiError ? error.message : "No pudimos consultar los turnos cerrados.",
      );
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [getAccessToken, logout]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadHistory(page), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadHistory, page]);

  if (isLoading && !result) return <LoadingState label="Consultando turnos cerrados…" />;
  if (!result) {
    return (
      <ErrorState
        title="Historial no disponible"
        message={errorMessage ?? "No pudimos consultar los turnos cerrados."}
        actionLabel="Intentar nuevamente"
        onAction={() => void loadHistory(page)}
      />
    );
  }

  return (
    <div className="history-page">
      <header className="operational-heading">
        <div>
          <p className="eyebrow">Registro operativo</p>
          <h1>Historial de turnos</h1>
          <p>Consulta cierres anteriores y su evidencia autoritativa.</p>
        </div>
        <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadHistory(page)}>
          Actualizar
        </Button>
      </header>

      {errorMessage && <div className="tables-notice" data-tone="warning" role="alert">{errorMessage}</div>}

      {result.items.length === 0 ? (
        <Surface className="operational-empty-card">
          <span aria-hidden="true">H</span>
          <h2>{result.pagination.total === 0 ? "Aún no hay turnos cerrados" : "Esta página no contiene turnos"}</h2>
          <p>{result.pagination.total === 0 ? "Los cierres aparecerán aquí cuando existan jornadas históricas." : "Actualiza para recuperar la página válida más cercana."}</p>
        </Surface>
      ) : (
        <div className="history-list" aria-busy={isLoading}>
          {result.items.map((shift) => (
            <Surface className="history-shift-card" key={shift.shiftId}>
              <div className="history-shift-card__identity">
                <span className="operational-status">CLOSED</span>
                <div><span>Apertura</span><strong>{formatOperationalDate(shift.openedAt)}</strong></div>
                <div><span>Cierre</span><strong>{formatOperationalDate(shift.closedAt)}</strong></div>
                <p>Abrió: {actorLabel(shift.openedBy)} · Cerró: {actorLabel(shift.closedBy)}</p>
              </div>
              <div className="history-shift-card__money">
                <div><span>Ventas</span><strong>{formatOperationalMoney(shift.businessSalesTotal)}</strong></div>
                <div><span>Efectivo</span><strong>{formatOperationalMoney(shift.cashTotal)}</strong></div>
                <div><span>Yape</span><strong>{formatOperationalMoney(shift.yapeTotal)}</strong></div>
                <div><span>Tarjeta</span><strong>{formatOperationalMoney(shift.cardTotal)}</strong></div>
                <div><span>Gastos</span><strong>{formatOperationalMoney(shift.operationalExpensesTotal)}</strong></div>
              </div>
              <div className="history-shift-card__activity">
                <span>{shift.serviceSessionsCount} atenciones</span>
                <span>{shift.ordersCount} comandas</span>
                <span data-ready={shift.reconciliationExists}>{shift.reconciliationExists ? "Con cuadre" : "Sin cuadre"}</span>
                <Link className="button button--secondary" href={`/historial/${encodeURIComponent(shift.shiftId)}`}>Ver detalle</Link>
              </div>
            </Surface>
          ))}
        </div>
      )}

      <nav className="history-pagination" aria-label="Paginación del historial">
        <Button type="button" variant="secondary" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button>
        <p>Página <strong>{result.pagination.page}</strong> de <strong>{Math.max(1, result.pagination.totalPages)}</strong> · {result.pagination.total} turnos</p>
        <Button type="button" variant="secondary" disabled={page >= result.pagination.totalPages || isLoading} onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
      </nav>
    </div>
  );
}
