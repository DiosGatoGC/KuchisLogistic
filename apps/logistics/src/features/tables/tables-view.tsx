"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { CompactToolbarControls } from "@/components/layout/compact-toolbar-controls";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import {
  consumeOrderCreatedFeedback,
  orderCreatedMessage,
} from "@/lib/order-created-feedback";
import { can } from "@/lib/permissions/capabilities";

import {
  getServicePointStatus,
  getServiceSession,
  openServicePoint,
  releaseServiceSession,
} from "./tables-api";
import { isRefreshConflict, tablesErrorMessage } from "./tables-errors";
import {
  arrangeDiningPoints,
  arrangeTakeawayPoints,
  displayLabel,
  interactionForPoint,
  statusForPoint,
  validateReleaseReason,
} from "./tables-model";
import type {
  ServicePointStatus,
  ServiceSessionDetail,
} from "./tables-types";

type ServiceMode = "salon" | "takeaway";
type DialogState =
  | { kind: "open"; pointId: string }
  | { kind: "occupied"; pointId: string; sessionId: string }
  | { kind: "detail"; pointId: string; sessionId: string }
  | { kind: "release"; pointId: string; sessionId: string }
  | null;

const tabs = [
  { value: "salon", label: "Salón" },
  { value: "takeaway", label: "Llevar" },
] as const;

const roleLabels = {
  ADMIN: "Administrador",
  MANAGER: "Gerencia",
  WAITER: "Salón",
  CASHIER: "Caja",
  KITCHEN: "Cocina",
} as const;

function pointKind(point: ServicePointStatus) {
  if (point.type === "TABLE") return "table";
  if (point.type === "BAR") return "bar";
  return "takeaway";
}

function pointKindLabel(point: ServicePointStatus) {
  if (point.type === "TABLE") return "Mesa";
  if (point.type === "BAR") return "Barra";
  return "Llevar";
}

function activeStatusLabel(point: ServicePointStatus) {
  return point.activeSession?.status === "AWAITING_PAYMENT"
    ? "pendiente de pago"
    : "abierta";
}

function formatOpenedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ServicePointButton({
  point,
  canOperate,
  busy,
  onActivate,
}: {
  point: ServicePointStatus;
  canOperate: boolean;
  busy: boolean;
  onActivate: (point: ServicePointStatus) => void;
}) {
  const interaction = interactionForPoint(point, canOperate);
  const status = statusForPoint(point);
  const disabled = interaction === "none" || busy;
  const actionLabel =
    interaction === "open"
      ? `Abrir ${point.name}`
      : interaction === "view"
        ? `Ver atención de ${point.name}`
        : `${point.name}, sin acciones disponibles`;
  const statusLabel =
    status === "payment"
      ? "pendiente de pago"
      : status === "available"
        ? "libre"
        : status === "inactive"
          ? "inactiva"
          : "abierta";

  return (
    <button
      type="button"
      className="service-point"
      data-kind={pointKind(point)}
      data-point={displayLabel(point)}
      data-status={status}
      disabled={disabled}
      aria-label={`${actionLabel}. Estado: ${statusLabel}.`}
      aria-busy={busy}
      onClick={() => onActivate(point)}
    >
      <span className="service-point__kind">{pointKindLabel(point)}</span>
      <strong>{displayLabel(point)}</strong>
      {busy ? (
        <span className="service-point__busy" role="status">
          <span className="spinner spinner--small" aria-hidden="true" />
          Actualizando
        </span>
      ) : (
        <StatusBadge status={status} />
      )}
    </button>
  );
}

interface RoomProps {
  points: readonly ServicePointStatus[];
  canOperate: boolean;
  busyPointId: string | null;
  onActivate: (point: ServicePointStatus) => void;
}

function DiningRoom({
  points,
  canOperate,
  busyPointId,
  onActivate,
}: RoomProps) {
  return (
    <div className="floor-scroll">
      <div className="dining-map" aria-label="Distribución operacional del salón">
        {arrangeDiningPoints(points).map((point) => (
          <ServicePointButton
            key={point.id}
            point={point}
            canOperate={canOperate}
            busy={busyPointId === point.id}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  );
}

function TakeawayRoom({
  points,
  canOperate,
  busyPointId,
  onActivate,
}: RoomProps) {
  return (
    <div className="floor-scroll">
      <div
        className="takeaway-map"
        aria-label="Distribución operacional de pedidos para llevar"
      >
        {arrangeTakeawayPoints(points).map((point) => (
          <ServicePointButton
            key={point.id}
            point={point}
            canOperate={canOperate}
            busy={busyPointId === point.id}
            onActivate={onActivate}
          />
        ))}
      </div>
    </div>
  );
}

export function TablesView() {
  const router = useRouter();
  const { user, getAccessToken, logout } = useAuth();
  const [mode, setMode] = useState<ServiceMode>("salon");
  const [points, setPoints] = useState<ServicePointStatus[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busyPointId, setBusyPointId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServiceSessionDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const statusRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const mutationLockRef = useRef(false);
  const pointsRef = useRef<ServicePointStatus[] | null>(null);

  const canOperate = can(user, "tables.operate");
  const canRelease = can(user, "tables.release");
  const canCreateOrder = can(user, "orders.create");

  const handleUnauthorized = useCallback(
    async (error: unknown) => {
      if (error instanceof ApiError && error.kind === "unauthorized") {
        await logout();
        return true;
      }
      return false;
    },
    [logout],
  );

  const refreshStatus = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const requestId = ++statusRequestRef.current;
      if (!background) setIsLoading(true);
      setLoadError(null);

      try {
        const accessToken = await getAccessToken();
        const result = await getServicePointStatus(accessToken);
        if (requestId !== statusRequestRef.current) return false;
        pointsRef.current = result.servicePoints;
        setPoints(result.servicePoints);
        return true;
      } catch (error) {
        if (requestId !== statusRequestRef.current) return false;
        if (await handleUnauthorized(error)) return false;
        const message = tablesErrorMessage(error);
        if (pointsRef.current && background) setNotice(message);
        else setLoadError(message);
        return false;
      } finally {
        if (requestId === statusRequestRef.current) setIsLoading(false);
      }
    },
    [getAccessToken, handleUnauthorized],
  );

  useEffect(() => {
    const feedback = window.setTimeout(() => {
      const sequenceNumber = consumeOrderCreatedFeedback();
      if (sequenceNumber !== null) {
        setNotice(orderCreatedMessage(sequenceNumber));
      }
    }, 0);
    return () => window.clearTimeout(feedback);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refreshStatus]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && pointsRef.current) {
        void refreshStatus({ background: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshStatus]);

  const selectedPoint = useMemo(
    () => points?.find((point) => point.id === dialog?.pointId) ?? null,
    [dialog?.pointId, points],
  );

  const closeDialog = useCallback(() => {
    if (busyPointId) return;
    detailRequestRef.current += 1;
    setDialog(null);
    setDialogError(null);
    setDetail(null);
    setIsDetailLoading(false);
    setReleaseReason("");
    setReasonError(null);
  }, [busyPointId]);

  const handlePointActivation = useCallback(
    (point: ServicePointStatus) => {
      setNotice(null);
      setDialogError(null);
      if (point.activeSession) {
        setDialog({
          kind: "occupied",
          pointId: point.id,
          sessionId: point.activeSession.id,
        });
      } else if (canOperate && point.isActive) {
        setDialog({ kind: "open", pointId: point.id });
      }
    },
    [canOperate],
  );

  const confirmOpen = async () => {
    if (
      dialog?.kind !== "open" ||
      !selectedPoint ||
      busyPointId ||
      mutationLockRef.current
    ) {
      return;
    }
    const point = selectedPoint;
    mutationLockRef.current = true;
    setBusyPointId(point.id);
    setDialogError(null);

    try {
      const accessToken = await getAccessToken();
      const result = await openServicePoint(point.id, accessToken);
      const refreshed = await refreshStatus({ background: true });
      setNotice(
        refreshed
          ? `${point.name} quedó abierta y sincronizada.`
          : `${point.name} se abrió, pero no pudimos actualizar el plano. Usa Actualizar.`,
      );
      setDialog({
        kind: "occupied",
        pointId: point.id,
        sessionId: result.session.id,
      });
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      if (
        error instanceof ApiError &&
        error.code === "SERVICE_POINT_OCCUPIED"
      ) {
        const refreshed = await refreshStatus({ background: true });
        setDialog(null);
        setNotice(
          refreshed
            ? `${point.name} acaba de ser abierta por otro usuario.`
            : `${point.name} cambió en otro dispositivo, pero no pudimos actualizar el plano.`,
        );
        return;
      }
      if (isRefreshConflict(error)) {
        await refreshStatus({ background: true });
      }
      setDialogError(tablesErrorMessage(error, `No se pudo abrir ${point.name}.`));
    } finally {
      mutationLockRef.current = false;
      setBusyPointId(null);
    }
  };

  const showSessionDetail = async (pointId: string, sessionId: string) => {
    const requestId = ++detailRequestRef.current;
    setDialog({ kind: "detail", pointId, sessionId });
    setDialogError(null);
    setDetail(null);
    setIsDetailLoading(true);

    try {
      const accessToken = await getAccessToken();
      const result = await getServiceSession(sessionId, accessToken);
      if (requestId === detailRequestRef.current) setDetail(result.session);
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      if (await handleUnauthorized(error)) return;
      if (isRefreshConflict(error)) {
        await refreshStatus({ background: true });
      }
      setDialogError(
        tablesErrorMessage(error, "No se pudo consultar la atención."),
      );
    } finally {
      if (requestId === detailRequestRef.current) setIsDetailLoading(false);
    }
  };

  const startRelease = () => {
    if (dialog?.kind !== "detail" || !canRelease) return;
    setReleaseReason("");
    setReasonError(null);
    setDialogError(null);
    setDialog({
      kind: "release",
      pointId: dialog.pointId,
      sessionId: dialog.sessionId,
    });
  };

  const confirmRelease = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      dialog?.kind !== "release" ||
      !selectedPoint ||
      busyPointId ||
      mutationLockRef.current
    ) {
      return;
    }

    const validation = validateReleaseReason(releaseReason);
    setReasonError(validation.error);
    if (validation.error) return;

    const point = selectedPoint;
    mutationLockRef.current = true;
    setBusyPointId(point.id);
    setDialogError(null);

    try {
      const accessToken = await getAccessToken();
      await releaseServiceSession(
        dialog.sessionId,
        validation.reason,
        accessToken,
      );
      const refreshed = await refreshStatus({ background: true });
      setDialog(null);
      setDetail(null);
      setReleaseReason("");
      setNotice(
        refreshed
          ? `La atención de ${point.name} fue liberada y sincronizada.`
          : `La atención de ${point.name} fue liberada, pero el plano no pudo actualizarse.`,
      );
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      if (isRefreshConflict(error)) {
        await refreshStatus({ background: true });
      }
      setDialogError(
        tablesErrorMessage(error, "No se pudo liberar la atención."),
      );
    } finally {
      mutationLockRef.current = false;
      setBusyPointId(null);
    }
  };

  const pointCountWarning =
    points && points.length !== 18
      ? `El backend devolvió ${points.length} de 18 puntos esperados.`
      : null;

  return (
    <div className="tables-page">
      <header className="tables-heading">
        <div>
          <p className="eyebrow">Operación sincronizada</p>
          <h1>Mesas</h1>
          <p>Consulta y gestiona las atenciones con el estado real de Logistics.</p>
        </div>
        <Tabs
          label="Tipo de atención"
          options={tabs}
          value={mode}
          onChange={setMode}
        />
      </header>

      <CompactToolbarControls>
        <Tabs
          label="Tipo de atención"
          options={tabs}
          value={mode}
          onChange={setMode}
        />
      </CompactToolbarControls>

      {(notice || pointCountWarning) && (
        <div
          className="tables-notice"
          data-tone={pointCountWarning ? "warning" : "info"}
          role="status"
          aria-live="polite"
        >
          {pointCountWarning ?? notice}
        </div>
      )}

      <section className="floor-surface" aria-busy={isLoading}>
        <div className="floor-surface__meta">
          <div>
            <strong>
              {mode === "salon" ? "Distribución del salón" : "Pedidos para llevar"}
            </strong>
            <small>
              {points
                ? `${points.length} puntos sincronizados · ${canOperate ? "Modo operacional" : "Solo consulta"}`
                : "Consultando Logistics"}
            </small>
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={isLoading}
            onClick={() => void refreshStatus()}
          >
            Actualizar
          </Button>
        </div>

        {isLoading && !points ? (
          <LoadingState label="Consultando el estado de mesas…" />
        ) : loadError && !points ? (
          <ErrorState
            title="No pudimos cargar las mesas"
            message={loadError}
            actionLabel="Intentar nuevamente"
            onAction={() => void refreshStatus()}
          />
        ) : points && points.length > 0 ? (
          mode === "salon" ? (
            <DiningRoom
              points={points}
              canOperate={canOperate}
              busyPointId={busyPointId}
              onActivate={handlePointActivation}
            />
          ) : (
            <TakeawayRoom
              points={points}
              canOperate={canOperate}
              busyPointId={busyPointId}
              onActivate={handlePointActivation}
            />
          )
        ) : (
          <ErrorState
            title="No hay puntos configurados"
            message="Logistics no devolvió puntos de atención para este local."
            actionLabel="Actualizar"
            onAction={() => void refreshStatus()}
          />
        )}
      </section>

      <aside className="status-legend" aria-label="Estados de los puntos de atención">
        <span>Estados</span>
        <StatusBadge status="available" />
        <StatusBadge status="open" />
        <StatusBadge status="payment" />
        <StatusBadge status="inactive" />
      </aside>

      {dialog?.kind === "open" && selectedPoint && (
        <OperationalDialog
          title={`Abrir ${selectedPoint.name}`}
          description={`¿Deseas abrir ${selectedPoint.name}?`}
          busy={busyPointId === selectedPoint.id}
          onClose={closeDialog}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busyPointId)}
                onClick={closeDialog}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                loading={busyPointId === selectedPoint.id}
                onClick={() => void confirmOpen()}
              >
                Abrir {selectedPoint.type === "TABLE" ? "mesa" : "atención"}
              </Button>
            </>
          }
        >
          <p>
            Se creará una atención real en el turno abierto y el estado se
            consultará nuevamente al terminar.
          </p>
          {dialogError && (
            <p className="dialog-error" role="alert">{dialogError}</p>
          )}
        </OperationalDialog>
      )}

      {dialog?.kind === "occupied" && selectedPoint && (
        <OperationalDialog
          title={`${selectedPoint.name} está ${activeStatusLabel(selectedPoint)}`}
          description="Este punto ya tiene una atención activa."
          onClose={closeDialog}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void showSessionDetail(selectedPoint.id, dialog.sessionId)
                }
              >
                Ver atención
              </Button>
            </>
          }
        >
          <StatusBadge status={statusForPoint(selectedPoint)} />
          <p>Consulta quién abrió la atención y cuándo inició.</p>
        </OperationalDialog>
      )}

      {dialog?.kind === "detail" && selectedPoint && (
        <OperationalDialog
          title={selectedPoint.name}
          description="Detalle básico de la atención"
          onClose={closeDialog}
          footer={
            <>
              {detail?.status === "OPEN" && canCreateOrder && (
                <Button
                  type="button"
                  onClick={() => router.push(`/comandar/${detail.id}`)}
                >
                  Comandar
                </Button>
              )}
              {detail &&
                canRelease &&
                (detail.status === "OPEN" ||
                  detail.status === "AWAITING_PAYMENT") && (
                <Button type="button" variant="secondary" onClick={startRelease}>
                  Liberar atención
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={closeDialog}>Volver</Button>
            </>
          }
        >
          {isDetailLoading ? (
            <LoadingState label="Consultando la atención…" />
          ) : dialogError ? (
            <p className="dialog-error" role="alert">{dialogError}</p>
          ) : detail ? (
            <dl className="session-detail">
              <div>
                <dt>Estado</dt>
                <dd>{detail.status === "AWAITING_PAYMENT" ? "Pendiente de pago" : detail.status === "OPEN" ? "Abierta" : detail.status}</dd>
              </div>
              <div><dt>Abierta</dt><dd>{formatOpenedAt(detail.openedAt)}</dd></div>
              <div><dt>Abierta por</dt><dd>{detail.openedBy.fullName}</dd></div>
              <div><dt>Rol</dt><dd>{roleLabels[detail.openedBy.role]}</dd></div>
            </dl>
          ) : null}
        </OperationalDialog>
      )}

      {dialog?.kind === "release" && selectedPoint && (
        <OperationalDialog
          title={`Liberar ${selectedPoint.name}`}
          description="Esta acción solo puede liberar una atención sin consumo."
          busy={busyPointId === selectedPoint.id}
          onClose={closeDialog}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busyPointId)}
                onClick={closeDialog}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="release-session-form"
                loading={busyPointId === selectedPoint.id}
              >
                Liberar
              </Button>
            </>
          }
        >
          <form id="release-session-form" onSubmit={confirmRelease}>
            <label className="field__label" htmlFor="release-reason">Motivo</label>
            <textarea
              id="release-reason"
              className="input release-reason"
              value={releaseReason}
              maxLength={500}
              rows={4}
              disabled={Boolean(busyPointId)}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? "release-reason-error" : "release-reason-count"}
              onChange={(event) => {
                setReleaseReason(event.target.value);
                if (reasonError) setReasonError(null);
              }}
            />
            <div className="release-reason__meta">
              {reasonError ? (
                <span id="release-reason-error" className="field__error" role="alert">{reasonError}</span>
              ) : (
                <span />
              )}
              <span id="release-reason-count">{releaseReason.length}/500</span>
            </div>
            {dialogError && (
              <p className="dialog-error" role="alert">{dialogError}</p>
            )}
          </form>
        </OperationalDialog>
      )}
    </div>
  );
}
