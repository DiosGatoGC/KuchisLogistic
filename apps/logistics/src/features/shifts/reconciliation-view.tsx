"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";

import { executeReconciliationAttempt } from "./closeout-attempts";
import {
  classifyReconciliationFailure,
  closeoutApiErrorMessage,
  isReconciliationNotFound,
} from "./closeout-errors";
import {
  isResolvableShiftId,
  reconciliationFromResult,
  reconciliationPayload,
  reconciliationPermissions,
  validateReconciliationInput,
} from "./closeout-model";
import { formatOperationalDate, formatOperationalMoney } from "./shift-formatters";
import { getShiftClosure, getShiftReconciliation, reconcileShift } from "./shifts-api";
import { runWithShiftLock } from "./shifts-model";
import type { CashReconciliation, ShiftClosureResult } from "./shifts-types";

const initialForm = { countedCash: "", confirmedYape: "", confirmedCardCustomerTotal: "", notes: "" };

function ReconciliationResult({ reconciliation }: { reconciliation: CashReconciliation }) {
  const rows = [
    { label: "Efectivo", expected: reconciliation.expectedCash, confirmed: reconciliation.countedCash, difference: reconciliation.cashDifference },
    { label: "Yape", expected: reconciliation.expectedYape, confirmed: reconciliation.confirmedYape, difference: reconciliation.yapeDifference },
    { label: "Tarjeta cliente", expected: reconciliation.expectedCardCustomerTotal, confirmed: reconciliation.confirmedCardCustomerTotal, difference: reconciliation.cardDifference },
  ];
  return (
    <Surface className="reconciliation-terminal">
      <header><div><p className="eyebrow">Cuadre guardado</p><h2>Reconciliación final</h2><p>{formatOperationalDate(reconciliation.createdAt)}</p></div><span aria-hidden="true">✓</span></header>
      <div className="reconciliation-result-table" role="table" aria-label="Resultado del cuadre">
        <div role="row" className="reconciliation-result-table__heading"><span>Canal</span><span>Esperado</span><span>Confirmado</span><span>Diferencia</span></div>
        {rows.map((row) => <div role="row" key={row.label}><strong>{row.label}</strong><span>{formatOperationalMoney(row.expected)}</span><span>{formatOperationalMoney(row.confirmed)}</span><strong data-sign={row.difference === 0 ? "zero" : row.difference > 0 ? "positive" : "negative"}>{formatOperationalMoney(row.difference)}</strong></div>)}
      </div>
      <div className="reconciliation-breakdown">
        <span>Apertura {formatOperationalMoney(reconciliation.openingCashSnapshot)}</span>
        <span>Ventas efectivo {formatOperationalMoney(reconciliation.cashSalesExpected)}</span>
        <span>Gastos {formatOperationalMoney(reconciliation.cashExpensesSnapshot)}</span>
        <span>Tarjeta negocio {formatOperationalMoney(reconciliation.expectedCardBusiness)}</span>
        <span>Comisión tarjeta {formatOperationalMoney(reconciliation.expectedCardFee)}</span>
      </div>
      <div className="closure-notes"><span>Notas de cuadre</span><p>{reconciliation.notes ?? "Sin notas."}</p></div>
    </Surface>
  );
}

export function ReconciliationView({ shiftId }: { shiftId: string | null }) {
  const { user, getAccessToken, logout } = useAuth();
  const permissions = reconciliationPermissions(user?.capabilities ?? []);
  const resolvable = isResolvableShiftId(shiftId);
  const [closure, setClosure] = useState<ShiftClosureResult | null>(null);
  const [reconciliation, setReconciliation] = useState<CashReconciliation | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(resolvable);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnresolved, setIsUnresolved] = useState(false);
  const [isClosureReadUnavailable, setIsClosureReadUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lockRef = useRef({ current: false });

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (error instanceof ApiError && error.kind === "unauthorized") {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const load = useCallback(async () => {
    if (!shiftId || !isResolvableShiftId(shiftId)) return;
    setIsLoading(true);
    setIsClosureReadUnavailable(false);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      try {
        const existing = await getShiftReconciliation(shiftId, accessToken);
        setReconciliation(reconciliationFromResult(existing));
        setClosure(null);
        setIsUnresolved(false);
        return;
      } catch (error) {
        if (!isReconciliationNotFound(error)) throw error;
      }
      if (!permissions.canReadClosure) {
        setIsClosureReadUnavailable(true);
        setErrorMessage("Tu cuenta puede consultar el cuadre, pero no tiene shift.close para leer el cierre esperado. No se enviará ninguna operación.");
        return;
      }
      const closureResult = await getShiftClosure(shiftId, accessToken);
      if (closureResult.shift.status !== "CLOSED") {
        setErrorMessage("El turno todavía no está cerrado y no admite cuadre.");
        return;
      }
      setClosure(closureResult);
      setReconciliation(null);
      setIsUnresolved(false);
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      setErrorMessage(closeoutApiErrorMessage(error, "No pudimos cargar el cuadre de este turno."));
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, handleUnauthorized, permissions.canReadClosure, shiftId]);

  useEffect(() => {
    if (!resolvable) return;
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load, resolvable]);

  const openConfirmation = () => {
    const validation = validateReconciliationInput(form);
    setFormErrors(validation.errors);
    if (!validation.payload) return;
    setShowConfirmation(true);
  };

  const handleSubmit = async () => {
    if (!shiftId || !closure || reconciliation || isUnresolved || !permissions.canReconcile) return;
    const validation = validateReconciliationInput(form);
    setFormErrors(validation.errors);
    const validatedPayload = validation.payload;
    if (!validatedPayload) return;
    const payload = reconciliationPayload(validatedPayload);
    await runWithShiftLock(lockRef.current, async () => {
      setIsSubmitting(true);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeReconciliationAttempt({
          mutate: () => reconcileShift(shiftId, payload, accessToken),
          read: () => getShiftReconciliation(shiftId, accessToken),
          classifyFailure: classifyReconciliationFailure,
          isNotFound: isReconciliationNotFound,
        });
        setShowConfirmation(false);
        if (result.kind === "confirmed") {
          setReconciliation(reconciliationFromResult(result.response));
          setClosure(null);
          setNotice("Cuadre guardado con respuesta autoritativa.");
        } else if (result.kind === "reconciled-existing") {
          setReconciliation(reconciliationFromResult(result.stored));
          setClosure(null);
          setNotice("La respuesta fue incierta; el cuadre quedó confirmado por lectura autoritativa.");
        } else if (result.kind === "not-created") {
          setErrorMessage("La lectura autoritativa no encontró un cuadre. Revisa los valores antes de decidir otro intento.");
        } else {
          setIsUnresolved(true);
          setErrorMessage("El resultado del cuadre es incierto. Verifica antes de otra acción.");
        }
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        setShowConfirmation(false);
        setErrorMessage(closeoutApiErrorMessage(error, "No se pudo guardar el cuadre."));
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  if (!resolvable) {
    return <div className="reconciliation-page"><header className="operational-heading"><div><p className="eyebrow">Caja</p><h1>Cuadre de caja</h1></div></header><Surface className="operational-empty-card"><span aria-hidden="true">!</span><h2>Selecciona primero un turno cerrado</h2><p>Accede al cuadre desde el cierre exitoso de un turno. No se buscará un turno anterior automáticamente.</p><Link className="button button--primary" href="/turnos/cierre">Ir a Cierre de turno</Link></Surface></div>;
  }
  if (isLoading && !closure && !reconciliation) return <LoadingState label="Consultando el cuadre…" />;
  if (isClosureReadUnavailable && !reconciliation) {
    return <ErrorState title="Lectura de cierre no disponible" message={errorMessage ?? "Tu cuenta no puede consultar el cierre esperado; no se enviará ninguna operación."} />;
  }
  if (!closure && !reconciliation) {
    return <ErrorState title="Cuadre no disponible" message={errorMessage ?? "No pudimos consultar este turno."} actionLabel="Intentar nuevamente" onAction={() => void load()} />;
  }

  const confirmationPayload = showConfirmation
    ? validateReconciliationInput(form).payload
    : null;

  return (
    <div className="reconciliation-page">
      <header className="operational-heading"><div><p className="eyebrow">Caja</p><h1>Cuadre de caja</h1><p>Compara los valores esperados con el conteo y confirmaciones reales.</p></div>{!reconciliation && <Button type="button" variant="secondary" loading={isLoading} onClick={() => void load()}>Actualizar</Button>}</header>
      {(notice || errorMessage) && <div className="tables-notice" data-tone={errorMessage ? "warning" : "info"} role={errorMessage ? "alert" : "status"}>{errorMessage ?? notice}</div>}
      {reconciliation ? <ReconciliationResult reconciliation={reconciliation} /> : closure ? (
        <div className="reconciliation-layout">
          <Surface className="reconciliation-expected">
            <div><p className="eyebrow">Snapshot de cierre</p><h2>Valores esperados</h2></div>
            <dl className="operational-detail-list">
              <div><dt>Efectivo inicial</dt><dd>{formatOperationalMoney(closure.shift.openingCash)}</dd></div>
              <div><dt>Ventas en efectivo</dt><dd>{formatOperationalMoney(closure.closure.cashTotal)}</dd></div>
              <div><dt>Gastos operativos</dt><dd>{formatOperationalMoney(closure.closure.operationalExpensesTotal)}</dd></div>
              <div><dt>Efectivo esperado</dt><dd>{formatOperationalMoney(closure.expectedCashAtClose)}</dd></div>
              <div><dt>Yape esperado</dt><dd>{formatOperationalMoney(closure.closure.yapeTotal)}</dd></div>
              <div><dt>Tarjeta negocio</dt><dd>{formatOperationalMoney(closure.closure.cardTotal)}</dd></div>
              <div><dt>Comisión tarjeta</dt><dd>{formatOperationalMoney(closure.closure.cardFeeTotal)}</dd></div>
              <div><dt>Tarjeta cliente</dt><dd>{formatOperationalMoney(closure.closure.customerCardTotal)}</dd></div>
            </dl>
          </Surface>
          <Surface className="reconciliation-form">
            <div><p className="eyebrow">Confirmación física</p><h2>Registrar cuadre</h2></div>
            <Input id="counted-cash" name="countedCash" label="Efectivo contado" inputMode="decimal" value={form.countedCash} error={formErrors.countedCash} disabled={isSubmitting || isUnresolved} onChange={(event) => setForm((previous) => ({ ...previous, countedCash: event.target.value }))} />
            <Input id="confirmed-yape" name="confirmedYape" label="Yape confirmado" inputMode="decimal" value={form.confirmedYape} error={formErrors.confirmedYape} disabled={isSubmitting || isUnresolved} onChange={(event) => setForm((previous) => ({ ...previous, confirmedYape: event.target.value }))} />
            <Input id="confirmed-card-total" name="confirmedCardCustomerTotal" label="Total cliente tarjeta confirmado" inputMode="decimal" value={form.confirmedCardCustomerTotal} error={formErrors.confirmedCardCustomerTotal} disabled={isSubmitting || isUnresolved} onChange={(event) => setForm((previous) => ({ ...previous, confirmedCardCustomerTotal: event.target.value }))} />
            <label className="field"><span className="field__label">Notas (opcional)</span><textarea className="input operational-textarea" value={form.notes} maxLength={500} disabled={isSubmitting || isUnresolved} aria-invalid={Boolean(formErrors.notes)} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} />{formErrors.notes && <span className="field__error" role="alert">{formErrors.notes}</span>}</label>
            {isUnresolved ? <Button type="button" variant="secondary" loading={isLoading} onClick={() => void load()}>Verificar cuadre</Button> : <Button type="button" onClick={openConfirmation}>Revisar cuadre</Button>}
          </Surface>
        </div>
      ) : null}

      {confirmationPayload && closure && (
        <OperationalDialog title="Confirmar cuadre de caja" description="El cuadre se enviará una sola vez y quedará como evidencia de la jornada." busy={isSubmitting} onClose={() => setShowConfirmation(false)} footer={<><Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => setShowConfirmation(false)}>Volver</Button><Button type="button" loading={isSubmitting} onClick={() => void handleSubmit()}>Guardar cuadre</Button></>}><dl className="operational-detail-list"><div><dt>Efectivo contado</dt><dd>{formatOperationalMoney(confirmationPayload.countedCash)}</dd></div><div><dt>Yape confirmado</dt><dd>{formatOperationalMoney(confirmationPayload.confirmedYape)}</dd></div><div><dt>Tarjeta cliente</dt><dd>{formatOperationalMoney(confirmationPayload.confirmedCardCustomerTotal)}</dd></div></dl></OperationalDialog>
      )}
    </div>
  );
}
