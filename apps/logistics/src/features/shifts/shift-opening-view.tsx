"use client";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { useLogisticsRealtime } from "@/features/realtime/use-logistics-realtime";
import { ApiError, isSessionInvalidError } from "@/lib/api/client";

import { executeOpenShiftAttempt } from "./shift-opening-attempt";
import { formatOperationalDate, formatOperationalMoney, USER_ROLE_LABELS } from "./shift-formatters";
import { getCurrentShift, openShift } from "./shifts-api";
import { classifyShiftMutationFailure, shiftsApiErrorMessage } from "./shifts-errors";
import {
  isCurrentOpenShift,
  openingCashPayload,
  parseMoneyInput,
  runWithShiftLock,
  shiftPermissions,
} from "./shifts-model";
import type { Shift } from "./shifts-types";

export function ShiftOpeningView() {
  const { user, getAccessToken, logout } = useAuth();
  const permissions = shiftPermissions(user?.capabilities ?? []);
  const [shift, setShift] = useState<Shift | null>(null);
  const [openingCash, setOpeningCash] = useState("0.00");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [isUnresolved, setIsUnresolved] = useState(false);
  const requestRef = useRef(0);
  const openingLockRef = useRef({ current: false });

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (isSessionInvalidError(error)) {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadCurrent = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const result = await getCurrentShift(accessToken);
      if (requestId !== requestRef.current) return null;
      const currentShift = isCurrentOpenShift(result);
      setShift(currentShift);
      setIsUnresolved(false);
      return currentShift;
    } catch (error) {
      if (requestId !== requestRef.current) return null;
      if (await handleUnauthorized(error)) return null;
      setErrorMessage(shiftsApiErrorMessage(error, "No pudimos consultar el turno actual."));
      return null;
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [getAccessToken, handleUnauthorized]);

  useLogisticsRealtime({
    topics: [LOGISTICS_REALTIME_TOPICS.shift],
    onInvalidate: () => {
      if (!isOpening) return loadCurrent();
    },
  });

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadCurrent(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadCurrent]);

  const handleOpen = async () => {
    if (!permissions.canOpen || isUnresolved) return;
    const parsed = parseMoneyInput(openingCash, { allowZero: true });
    if (!parsed.valid) {
      setAmountError(parsed.error);
      return;
    }
    setAmountError(null);
    await runWithShiftLock(openingLockRef.current, async () => {
      setIsOpening(true);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const payload = openingCashPayload(parsed.value);
        const result = await executeOpenShiftAttempt({
          mutate: () => openShift(payload.openingCash, accessToken),
          refetch: () => getCurrentShift(accessToken),
          classifyFailure: classifyShiftMutationFailure,
        });
        if (result.kind === "confirmed") {
          const currentShift = isCurrentOpenShift(result.current);
          setShift(currentShift ?? result.response.shift);
          setIsUnresolved(!currentShift);
          setNotice(currentShift
            ? "Turno abierto y confirmado con el estado autoritativo."
            : "El turno fue abierto, pero falta confirmar su estado actual.");
          return;
        }
        if (result.kind === "confirmed-refetch-failed") {
          setShift(result.response.shift);
          setIsUnresolved(true);
          setNotice("El turno fue abierto, pero no pudimos confirmar la lectura actual.");
          return;
        }
        if (result.kind === "reconciled-open") {
          setShift(isCurrentOpenShift(result.current));
          setIsUnresolved(false);
          setNotice("La respuesta fue incierta; el turno abierto quedó confirmado por una lectura autoritativa.");
          return;
        }
        if (result.kind === "reconciled-empty") {
          setShift(null);
          setErrorMessage("La apertura no quedó confirmada. Revisa el monto antes de decidir otro intento.");
          return;
        }
        setIsUnresolved(true);
        setErrorMessage("El resultado de la apertura es incierto. Verifica el turno antes de intentar nuevamente.");
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        if (error instanceof ApiError && error.code === "SHIFT_ALREADY_OPEN") {
          const currentShift = await loadCurrent();
          if (currentShift) setNotice("Ya existía un turno abierto; mostramos su estado autoritativo.");
          return;
        }
        setErrorMessage(shiftsApiErrorMessage(error));
      } finally {
        setIsOpening(false);
      }
    });
  };

  if (isLoading && !shift) return <LoadingState label="Consultando el turno actual…" />;
  if (errorMessage && !shift && !isUnresolved) {
    return <ErrorState title="Turno no disponible" message={errorMessage} actionLabel="Intentar nuevamente" onAction={() => void loadCurrent()} />;
  }

  return (
    <div className="shift-page">
      <header className="operational-heading">
        <div>
          <p className="eyebrow">Jornada operativa</p>
          <h1>Apertura de turno</h1>
          <p>Consulta el turno actual o inicia una nueva jornada.</p>
        </div>
        <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadCurrent()}>Actualizar</Button>
      </header>

      {(notice || errorMessage) && (
        <div className="tables-notice" data-tone={errorMessage ? "warning" : "info"} role={errorMessage ? "alert" : "status"}>
          {errorMessage ?? notice}
        </div>
      )}

      {shift ? (
        <Surface className="shift-current-card">
          <div className="shift-current-card__status">
            <span className="operational-status" data-status="active">OPEN</span>
            <p>Turno operativo actual</p>
          </div>
          <div className="shift-current-card__amount">
            <span>Efectivo inicial</span>
            <strong>{formatOperationalMoney(shift.openingCash)}</strong>
          </div>
          <dl className="operational-detail-list">
            <div><dt>Abierto</dt><dd>{formatOperationalDate(shift.openedAt)}</dd></div>
            <div><dt>Responsable</dt><dd>{USER_ROLE_LABELS[shift.openedBy.role]}</dd></div>
          </dl>
          {isUnresolved && (
            <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadCurrent()}>Verificar estado</Button>
          )}
        </Surface>
      ) : (
        <Surface className="shift-open-form">
          <div>
            <p className="eyebrow">Sin turno abierto</p>
            <h2>Iniciar jornada</h2>
            <p>Registra el efectivo disponible al comenzar. Puede ser S/ 0.00.</p>
          </div>
          <Input
            id="opening-cash"
            name="openingCash"
            label="Efectivo inicial"
            inputMode="decimal"
            autoComplete="off"
            value={openingCash}
            error={amountError ?? undefined}
            disabled={isOpening || isUnresolved}
            onChange={(event) => setOpeningCash(event.target.value)}
          />
          {isUnresolved ? (
            <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadCurrent()}>Verificar turno</Button>
          ) : (
            <Button type="button" loading={isOpening} onClick={() => void handleOpen()}>Abrir turno</Button>
          )}
        </Surface>
      )}
    </div>
  );
}
