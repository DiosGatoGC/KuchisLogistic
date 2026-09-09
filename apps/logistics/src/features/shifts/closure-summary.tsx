import Link from "next/link";

import { Surface } from "@/components/ui/surface";

import type { ClosureSummaryModel } from "./closeout-model";
import { formatOperationalDate, formatOperationalMoney } from "./shift-formatters";

export function ClosureSummary({
  closure,
  canReconcile,
}: {
  closure: ClosureSummaryModel;
  canReconcile: boolean;
}) {
  const reconciliationHref = `/caja/cuadre?shiftId=${encodeURIComponent(closure.shiftId)}`;
  return (
    <Surface className="closure-summary">
      <header className="closure-summary__heading">
        <div>
          <p className="eyebrow">Snapshot inmutable</p>
          <h2>Turno cerrado</h2>
          <p>{formatOperationalDate(closure.closedAt)}</p>
        </div>
        <span className="operational-status">CLOSED</span>
      </header>

      <div className="closure-financial-grid">
        <div><span>Ventas negocio</span><strong>{formatOperationalMoney(closure.businessSalesTotal)}</strong></div>
        <div><span>Efectivo</span><strong>{formatOperationalMoney(closure.cashTotal)}</strong></div>
        <div><span>Yape</span><strong>{formatOperationalMoney(closure.yapeTotal)}</strong></div>
        <div><span>Tarjeta negocio</span><strong>{formatOperationalMoney(closure.cardTotal)}</strong></div>
        <div><span>Comisión tarjeta</span><strong>{formatOperationalMoney(closure.cardFeeTotal)}</strong></div>
        <div><span>Total cliente tarjeta</span><strong>{formatOperationalMoney(closure.customerCardTotal)}</strong></div>
        <div><span>Gastos ({closure.operationalExpensesCount})</span><strong>{formatOperationalMoney(closure.operationalExpensesTotal)}</strong></div>
        <div className="closure-financial-grid__featured"><span>Efectivo esperado al cierre</span><strong>{formatOperationalMoney(closure.expectedCashAtClose)}</strong></div>
      </div>

      <dl className="closure-count-grid">
        <div><dt>Atenciones</dt><dd>{closure.serviceSessionsCount}</dd></div>
        <div><dt>Canceladas</dt><dd>{closure.cancelledSessionsCount}</dd></div>
        <div><dt>Comandas</dt><dd>{closure.ordersCount}</dd></div>
        <div><dt>Ítems</dt><dd>{closure.orderItemsCount}</dd></div>
        <div><dt>Unidades</dt><dd>{closure.productUnitsCount}</dd></div>
      </dl>

      <div className="closure-notes">
        <span>Notas de cierre</span>
        <p>{closure.closingNotes ?? "Sin notas."}</p>
      </div>

      {canReconcile && <Link className="button button--primary" href={reconciliationHref}>Ir a Cuadre de caja</Link>}
    </Surface>
  );
}
