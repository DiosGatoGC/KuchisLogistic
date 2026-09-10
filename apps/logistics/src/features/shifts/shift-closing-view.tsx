"use client";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { useLogisticsRealtime } from "@/features/realtime/use-logistics-realtime";
import { ApiError } from "@/lib/api/client";

import { executeCloseAttempt } from "./closeout-attempts";
import { ClosureSummary } from "./closure-summary";
import { classifyCloseFailure, closeoutApiErrorMessage } from "./closeout-errors";
import {
  canConfirmClose,
  closeShiftPayload,
  closeoutPermissions,
  closureFromCloseResponse,
  closureFromRead,
  type ClosureSummaryModel,
  validateOptionalNotes,
} from "./closeout-model";
import { formatOperationalDate, formatOperationalMoney, USER_ROLE_LABELS } from "./shift-formatters";
import { closeShift, getCurrentShift, getShift, getShiftClosure } from "./shifts-api";
import { isCurrentOpenShift, runWithShiftLock } from "./shifts-model";
import type { Shift } from "./shifts-types";

export function ShiftClosingView() {
  const { user, getAccessToken, logout } = useAuth();
  const permissions = closeoutPermissions(user?.capabilities ?? []);
  const [shift, setShift] = useState<Shift | null>(null);
  const [closure, setClosure] = useState<ClosureSummaryModel | null>(null);
  const [closingNotes, setClosingNotes] = useState("");
  const [notesError, setNotesError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(permissions.canReadCurrent);
  const [isClosing, setIsClosing] = useState(false);
  const [isUnresolved, setIsUnresolved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const closeLockRef = useRef({ current: false });

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (error instanceof ApiError && error.kind === "unauthorized") {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadCurrent = useCallback(async () => {
    if (!permissions.canReadCurrent) return null;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const result = await getCurrentShift(accessToken);
      const openShift = isCurrentOpenShift(result);
      setShift(openShift);
      setClosure(null);
      setIsUnresolved(false);
      return openShift;
    } catch (error) {
      if (await handleUnauthorized(error)) return null;
      setErrorMessage(closeoutApiErrorMessage(error, "No pudimos consultar el turno actual."));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, handleUnauthorized, permissions.canReadCurrent]);

  useLogisticsRealtime({
    topics: [LOGISTICS_REALTIME_TOPICS.shift, LOGISTICS_REALTIME_TOPICS.finance],
    onInvalidate: () => {
      if (!isClosing) return loadCurrent();
    },
    enabled: permissions.canReadCurrent,
  });

  useEffect(() => {
    if (!permissions.canReadCurrent) return;
    const initialLoad = window.setTimeout(() => void loadCurrent(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadCurrent, permissions.canReadCurrent]);

  const openConfirmation = () => {
    const validation = validateOptionalNotes(closingNotes);
    setNotesError(validation.error);
    if (validation.error) return;
    setShowConfirmation(true);
  };

  const handleClose = async () => {
    const notes = validateOptionalNotes(closingNotes);
    const allowed = canConfirmClose({
      shift,
      canClose: permissions.canClose,
      inFlight: isClosing,
      unresolved: isUnresolved,
      notesValid: !notes.error,
    });
    if (!shift || !allowed) return;
    const targetShift = shift;
    const payload = closeShiftPayload(notes.value);
    await runWithShiftLock(closeLockRef.current, async () => {
      setIsClosing(true);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeCloseAttempt({
          mutate: () => closeShift(targetShift.id, payload.closingNotes, accessToken),
          readShift: () => getShift(targetShift.id, accessToken),
          readClosure: () => getShiftClosure(targetShift.id, accessToken),
          classifyFailure: classifyCloseFailure,
        });
        setShowConfirmation(false);
        if (result.kind === "confirmed") {
          setClosure(closureFromRead(result.closure));
          setShift(null);
          setIsUnresolved(false);
          setNotice("Turno cerrado y snapshot autoritativo confirmado.");
          return;
        }
        if (result.kind === "confirmed-closure-failed") {
          setClosure(closureFromCloseResponse(result.response.closure));
          setShift(null);
          setIsUnresolved(true);
          setNotice("El turno fue cerrado; falta recuperar la lectura del snapshot autoritativo.");
          return;
        }
        if (result.kind === "reconciled-closed") {
          setClosure(closureFromRead(result.closure));
          setShift(null);
          setIsUnresolved(false);
          setNotice("La respuesta fue incierta; el cierre quedó confirmado por lecturas autoritativas.");
          return;
        }
        if (result.kind === "reconciled-open") {
          setShift(result.shift.shift);
          setIsUnresolved(false);
          setErrorMessage("El turno continúa abierto. Revisa los bloqueos antes de decidir otro intento.");
          return;
        }
        setIsUnresolved(true);
        setErrorMessage("El resultado del cierre es incierto. Verifica el turno antes de otra acción.");
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        setShowConfirmation(false);
        setErrorMessage(closeoutApiErrorMessage(error, "No se pudo cerrar el turno."));
      } finally {
        setIsClosing(false);
      }
    });
  };

  const verifyClose = async () => {
    if (!shift && !closure) return;
    const shiftId = shift?.id ?? closure?.shiftId;
    if (!shiftId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const [shiftResult, closureResult] = await Promise.allSettled([
        getShift(shiftId, accessToken),
        getShiftClosure(shiftId, accessToken),
      ]);
      if (shiftResult.status === "fulfilled" && shiftResult.value.shift.status === "OPEN") {
        setShift(shiftResult.value.shift);
        setClosure(null);
        setIsUnresolved(false);
        setErrorMessage("El turno continúa abierto. Revisa antes de decidir otro intento.");
      } else if (shiftResult.status === "fulfilled" && closureResult.status === "fulfilled") {
        setShift(null);
        setClosure(closureFromRead(closureResult.value));
        setIsUnresolved(false);
        setNotice("Cierre confirmado mediante lecturas autoritativas.");
      } else {
        setIsUnresolved(true);
        setErrorMessage("Todavía no pudimos determinar el estado final del cierre.");
      }
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      setErrorMessage(closeoutApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  if (!permissions.canReadCurrent) {
    return <ErrorState title="Consulta de turno no disponible" message="Tu cuenta puede cerrar turnos, pero no tiene shift.open para consultar el turno actual. No se enviará ninguna operación." />;
  }
  if (isLoading && !shift && !closure) return <LoadingState label="Consultando el turno actual…" />;
  if (errorMessage && !shift && !closure && !isUnresolved) {
    return <ErrorState title="Cierre no disponible" message={errorMessage} actionLabel="Intentar nuevamente" onAction={() => void loadCurrent()} />;
  }

  return (
    <div className="closeout-page">
      <header className="operational-heading">
        <div><p className="eyebrow">Fin de jornada</p><h1>Cierre de turno</h1><p>Confirma que toda la operación esté resuelta antes de cerrar.</p></div>
        {!closure && <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadCurrent()}>Actualizar</Button>}
      </header>

      {(notice || errorMessage) && <div className="tables-notice" data-tone={errorMessage ? "warning" : "info"} role={errorMessage ? "alert" : "status"}>{errorMessage ?? notice}</div>}

      {closure ? (
        <>
          <ClosureSummary closure={closure} canReconcile={permissions.canReconcile && !isUnresolved} />
          {isUnresolved && <Button type="button" variant="secondary" loading={isLoading} onClick={() => void verifyClose()}>Verificar cierre</Button>}
        </>
      ) : shift ? (
        <div className="closeout-layout">
          <Surface className="closeout-shift-card">
            <span className="operational-status" data-status="active">OPEN</span>
            <div><span>Efectivo inicial</span><strong>{formatOperationalMoney(shift.openingCash)}</strong></div>
            <dl className="operational-detail-list">
              <div><dt>Abierto</dt><dd>{formatOperationalDate(shift.openedAt)}</dd></div>
              <div><dt>Responsable</dt><dd>{USER_ROLE_LABELS[shift.openedBy.role]}</dd></div>
            </dl>
          </Surface>
          <Surface className="closeout-form">
            <div><p className="eyebrow">Confirmación final</p><h2>Cerrar jornada</h2><p>El backend verificará atenciones, ítems, pagos y efectivo esperado.</p></div>
            <label className="field">
              <span className="field__label">Notas de cierre (opcional)</span>
              <textarea className="input operational-textarea" value={closingNotes} maxLength={500} disabled={isClosing || isUnresolved} aria-invalid={Boolean(notesError)} onChange={(event) => setClosingNotes(event.target.value)} />
              {notesError && <span className="field__error" role="alert">{notesError}</span>}
            </label>
            {isUnresolved ? <Button type="button" variant="secondary" loading={isLoading} onClick={() => void verifyClose()}>Verificar estado</Button> : <Button type="button" onClick={openConfirmation}>Revisar cierre</Button>}
          </Surface>
        </div>
      ) : (
        <Surface className="operational-empty-card"><span aria-hidden="true">✓</span><h2>No hay turno abierto</h2><p>No existe una jornada activa para cerrar.</p></Surface>
      )}

      {showConfirmation && shift && (
        <OperationalDialog
          title="Confirmar cierre de turno"
          description="Esta operación es económica e irreversible. No se reintentará automáticamente."
          busy={isClosing}
          onClose={() => setShowConfirmation(false)}
          footer={<><Button type="button" variant="secondary" disabled={isClosing} onClick={() => setShowConfirmation(false)}>Volver</Button><Button type="button" loading={isClosing} onClick={() => void handleClose()}>Cerrar turno</Button></>}
        >
          <p>El backend validará que no existan atenciones activas, ítems pendientes ni inconsistencias de pago.</p>
          <p><strong>Notas:</strong> {validateOptionalNotes(closingNotes).value ?? "Sin notas"}</p>
        </OperationalDialog>
      )}
    </div>
  );
}
