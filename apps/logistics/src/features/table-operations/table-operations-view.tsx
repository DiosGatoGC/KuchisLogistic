"use client";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CompactToolbarControls } from "@/components/layout/compact-toolbar-controls";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { SelectField } from "@/components/ui/select-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-context";
import { useLogisticsRealtime } from "@/features/realtime/use-logistics-realtime";
import type { Order, OrderItem, OrderItemStatus } from "@/features/ordering/ordering-types";
import {
  arrangeDiningPoints,
  arrangeTakeawayPoints,
  displayLabel,
  statusForPoint,
} from "@/features/tables/tables-model";
import { getServicePointStatus } from "@/features/tables/tables-api";
import type { ServicePointStatus } from "@/features/tables/tables-types";
import { isSessionInvalidError } from "@/lib/api/client";
import { can } from "@/lib/permissions/capabilities";

import {
  cancelOrderItem,
  getTableOperationsSnapshot,
  transferOrderItem,
  transferServiceSession,
} from "./table-operations-api";
import {
  correctiveFailureKind,
  tableOperationsErrorMessage,
} from "./table-operations-errors";
import {
  eligibleItemTransferSessions,
  eligibleSessionTransferPoints,
  findOrderItem,
  itemCanBeCorrected,
  reconcileCancellation,
  reconcileItemTransfer,
  reconcileSessionTransfer,
  runWithOperationLock,
  tableOperationPermissions,
  validateOptionalReason,
  validateRequiredReason,
  validateTransferQuantity,
} from "./table-operations-model";
import { executeCorrectiveAttempt } from "./table-operations-mutation";
import type { TableOperationsSnapshot } from "./table-operations-types";

type ServiceMode = "salon" | "takeaway";
type DialogState =
  | { kind: "detail"; pointId: string; sessionId: string }
  | { kind: "cancel"; pointId: string; sessionId: string; itemId: string }
  | { kind: "transfer-session"; pointId: string; sessionId: string }
  | { kind: "transfer-item"; pointId: string; sessionId: string; itemId: string }
  | null;

const tabs = [
  { value: "salon", label: "Salón" },
  { value: "takeaway", label: "Llevar" },
] as const;

const itemStatusLabels: Record<OrderItemStatus, string> = {
  PENDING: "Pendiente",
  PREPARING: "Preparando",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusPoint({
  point,
  selected,
  onInspect,
}: {
  point: ServicePointStatus;
  selected: boolean;
  onInspect: (point: ServicePointStatus) => void;
}) {
  const status = statusForPoint(point);
  const inspectable = Boolean(point.isActive && point.activeSession);
  return (
    <button
      type="button"
      className="service-point table-operations-point"
      data-kind={pointKind(point)}
      data-point={displayLabel(point)}
      data-status={status}
      data-selected={selected}
      disabled={!inspectable}
      aria-label={`${point.name}. ${inspectable ? "Inspeccionar atención" : "Sin atención activa"}.`}
      onClick={() => onInspect(point)}
    >
      <span className="service-point__kind">{pointKindLabel(point)}</span>
      <strong>{displayLabel(point)}</strong>
      <StatusBadge status={status} />
    </button>
  );
}

function StatusMap({
  mode,
  points,
  selectedPointId,
  onInspect,
}: {
  mode: ServiceMode;
  points: readonly ServicePointStatus[];
  selectedPointId: string | null;
  onInspect: (point: ServicePointStatus) => void;
}) {
  const arranged = mode === "salon"
    ? arrangeDiningPoints(points)
    : arrangeTakeawayPoints(points);
  return (
    <div className="floor-scroll">
      <div
        className={mode === "salon" ? "dining-map" : "takeaway-map"}
        aria-label={mode === "salon" ? "Estado del salón" : "Estado de pedidos para llevar"}
      >
        {arranged.map((point) => (
          <StatusPoint
            key={point.id}
            point={point}
            selected={selectedPointId === point.id}
            onInspect={onInspect}
          />
        ))}
      </div>
    </div>
  );
}

function ItemDetails({ item }: { item: OrderItem }) {
  return (
    <div className="table-operation-item__details">
      {item.additions.length > 0 && (
        <span>
          {item.additions
            .map((addition) => `+ ${addition.quantityPerItem}× ${addition.additionName}`)
            .join(" · ")}
        </span>
      )}
      {item.notes && <span>Nota: {item.notes}</span>}
      {item.status === "CANCELLED" && item.cancellationReason && (
        <span>Motivo: {item.cancellationReason}</span>
      )}
    </div>
  );
}

function SessionOrders({
  orders,
  canCancel,
  canTransfer,
  hasTransferTargets,
  onCancel,
  onTransfer,
}: {
  orders: readonly Order[];
  canCancel: boolean;
  canTransfer: boolean;
  hasTransferTargets: boolean;
  onCancel: (item: OrderItem) => void;
  onTransfer: (item: OrderItem) => void;
}) {
  if (orders.length === 0) {
    return <p className="table-operations-empty">Esta atención todavía no tiene comandas.</p>;
  }
  return (
    <div className="table-operations-orders">
      {orders.map((order) => (
        <article className="sent-order table-operation-order" key={order.id}>
          <header>
            <div>
              <strong>Comanda #{order.sequenceNumber}</strong>
              <span>{formatDateTime(order.sentAt)}</span>
            </div>
            <span>{order.createdBy.fullName}</span>
          </header>
          {order.notes && <p className="sent-order__note">Nota: {order.notes}</p>}
          <ul>
            {order.items.map((item) => {
              const canCorrect = itemCanBeCorrected(item);
              return (
                <li className="table-operation-item" key={item.id}>
                  <div className="table-operation-item__summary">
                    <strong>{item.quantity}× {item.productName}</strong>
                    <span data-status={item.status}>{itemStatusLabels[item.status]}</span>
                  </div>
                  <ItemDetails item={item} />
                  {canCorrect && (canCancel || canTransfer) && (
                    <div className="table-operation-item__actions">
                      {canTransfer && (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={!hasTransferTargets}
                          onClick={() => onTransfer(item)}
                        >
                          Transferir
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          className="table-operation-item__cancel"
                          type="button"
                          variant="ghost"
                          onClick={() => onCancel(item)}
                        >
                          Cancelar ítem
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}

export function TableOperationsView() {
  const { user, getAccessToken, logout } = useAuth();
  const permissions = tableOperationPermissions(user?.capabilities ?? []);
  const canCheckout = can(user, "tables.operate");
  const [mode, setMode] = useState<ServiceMode>("salon");
  const [points, setPoints] = useState<ServicePointStatus[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [snapshot, setSnapshot] = useState<TableOperationsSnapshot | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [retryBlocked, setRetryBlocked] = useState(false);
  const [reason, setReason] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const statusRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const pointsRef = useRef<ServicePointStatus[] | null>(null);
  const locksRef = useRef(new Set<string>());

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (isSessionInvalidError(error)) {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const adoptSnapshot = useCallback((next: TableOperationsSnapshot) => {
    pointsRef.current = next.points;
    setPoints(next.points);
    setSnapshot(next);
  }, []);

  const loadStatus = useCallback(async (background = false) => {
    const requestId = ++statusRequestRef.current;
    if (!background) setIsLoading(true);
    setLoadError(null);
    try {
      const accessToken = await getAccessToken();
      const result = await getServicePointStatus(accessToken);
      if (requestId !== statusRequestRef.current) return;
      pointsRef.current = result.servicePoints;
      setPoints(result.servicePoints);
      setNotice(null);
    } catch (error) {
      if (requestId !== statusRequestRef.current) return;
      if (await handleUnauthorized(error)) return;
      const message = tableOperationsErrorMessage(
        error,
        "No pudimos cargar el estado de mesas.",
      );
      if (background && pointsRef.current) setNotice(message);
      else setLoadError(message);
    } finally {
      if (requestId === statusRequestRef.current) setIsLoading(false);
    }
  }, [getAccessToken, handleUnauthorized]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadStatus]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && pointsRef.current) {
        void loadStatus(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loadStatus]);

  const inspectPoint = useCallback(async (point: ServicePointStatus) => {
    if (!point.activeSession) return;
    const requestId = ++detailRequestRef.current;
    setDialog({
      kind: "detail",
      pointId: point.id,
      sessionId: point.activeSession.id,
    });
    setSnapshot(null);
    setDialogError(null);
    setIsDetailLoading(true);
    setRetryBlocked(false);
    try {
      const accessToken = await getAccessToken();
      const next = await getTableOperationsSnapshot(point.activeSession.id, accessToken);
      if (requestId !== detailRequestRef.current) return;
      adoptSnapshot(next);
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      if (await handleUnauthorized(error)) return;
      setDialogError(
        tableOperationsErrorMessage(error, "No pudimos consultar esta atención."),
      );
    } finally {
      if (requestId === detailRequestRef.current) setIsDetailLoading(false);
    }
  }, [adoptSnapshot, getAccessToken, handleUnauthorized]);

  const closeDialog = useCallback(() => {
    if (isMutating) return;
    detailRequestRef.current += 1;
    setDialog(null);
    setSnapshot(null);
    setDialogError(null);
    setRetryBlocked(false);
  }, [isMutating]);

  const returnToDetail = useCallback((next?: TableOperationsSnapshot) => {
    const current = next ?? snapshot;
    if (!current) return;
    setReason("");
    setDestinationId("");
    setQuantity("1");
    setDialogError(null);
    setRetryBlocked(false);
    setDialog({
      kind: "detail",
      pointId: current.session.servicePoint.id,
      sessionId: current.session.id,
    });
  }, [snapshot]);

  const refreshDialog = useCallback(async () => {
    if (!dialog) return;
    setIsDetailLoading(true);
    setDialogError(null);
    try {
      const accessToken = await getAccessToken();
      const next = await getTableOperationsSnapshot(dialog.sessionId, accessToken);
      adoptSnapshot(next);
      setRetryBlocked(false);
      if (dialog.kind === "detail") returnToDetail(next);
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      setDialogError(
        tableOperationsErrorMessage(error, "No pudimos actualizar la atención."),
      );
    } finally {
      setIsDetailLoading(false);
    }
  }, [adoptSnapshot, dialog, getAccessToken, handleUnauthorized, returnToDetail]);

  useLogisticsRealtime({
    topics: [LOGISTICS_REALTIME_TOPICS.tables],
    onInvalidate: async () => {
      if (isMutating) return;
      await loadStatus(true);
      if (dialog) await refreshDialog();
    },
  });

  const sessionTransferPoints = useMemo(
    () => snapshot
      ? eligibleSessionTransferPoints(snapshot.points, snapshot.session.servicePoint.id)
      : [],
    [snapshot],
  );
  const itemTransferPoints = useMemo(
    () => snapshot
      ? eligibleItemTransferSessions(snapshot.points, snapshot.session.id)
      : [],
    [snapshot],
  );
  const selectedItem = useMemo(
    () => dialog && "itemId" in dialog && snapshot
      ? findOrderItem(snapshot.orders, dialog.itemId)
      : null,
    [dialog, snapshot],
  );

  const beginCancel = (item: OrderItem) => {
    if (!dialog || !permissions.canCancel) return;
    setReason("");
    setDialogError(null);
    setRetryBlocked(false);
    setDialog({ ...dialog, kind: "cancel", itemId: item.id });
  };

  const beginSessionTransfer = () => {
    if (!dialog || !permissions.canTransfer) return;
    setDestinationId("");
    setReason("");
    setDialogError(null);
    setRetryBlocked(false);
    setDialog({
      kind: "transfer-session",
      pointId: dialog.pointId,
      sessionId: dialog.sessionId,
    });
  };

  const beginItemTransfer = (item: OrderItem) => {
    if (!dialog || !permissions.canTransfer) return;
    setDestinationId("");
    setQuantity(String(item.quantity));
    setReason("");
    setDialogError(null);
    setRetryBlocked(false);
    setDialog({ ...dialog, kind: "transfer-item", itemId: item.id });
  };

  const performCorrection = useCallback(async ({
    key,
    mutate,
    reconcile,
    successMessage,
  }: {
    key: string;
    mutate: (accessToken: string) => Promise<unknown>;
    reconcile: (next: TableOperationsSnapshot) => "applied" | "unchanged" | "changed";
    successMessage: string;
  }) => {
    if (!dialog || retryBlocked) return;
    await runWithOperationLock(locksRef.current, key, async () => {
      setIsMutating(true);
      setDialogError(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeCorrectiveAttempt({
          mutate: () => mutate(accessToken),
          refetch: () => getTableOperationsSnapshot(dialog.sessionId, accessToken),
          classifyFailure: correctiveFailureKind,
        });
        if (result.kind === "confirmed-refresh-failed") {
          setRetryBlocked(true);
          setDialogError(
            "La operación fue aceptada, pero no pudimos actualizar. Cierra y actualiza antes de continuar.",
          );
          return;
        }
        if (result.kind === "reconciliation-failed") {
          setRetryBlocked(true);
          setDialogError(
            "No pudimos confirmar el resultado. Cierra y actualiza antes de decidir otra acción.",
          );
          return;
        }
        adoptSnapshot(result.state);
        if (result.kind === "confirmed") {
          setNotice(successMessage);
          returnToDetail(result.state);
          return;
        }
        const decision = reconcile(result.state);
        if (decision === "applied") {
          setNotice("La actualización confirma que la operación sí fue aplicada.");
          returnToDetail(result.state);
        } else if (decision === "changed") {
          setNotice("El estado cambió en otro dispositivo y fue sincronizado.");
          returnToDetail(result.state);
        } else {
          const failureMessage = tableOperationsErrorMessage(
            result.error,
            "No se pudo aplicar la corrección.",
          );
          setDialogError(
            `${failureMessage} El estado sigue sin cambios; revisa los datos antes de volver a intentarlo.`,
          );
        }
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        setDialogError(tableOperationsErrorMessage(error));
      } finally {
        setIsMutating(false);
      }
    });
  }, [adoptSnapshot, dialog, getAccessToken, handleUnauthorized, retryBlocked, returnToDetail]);

  const submitCancel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "cancel" || !selectedItem) return;
    const validation = validateRequiredReason(reason);
    if (validation.error) {
      setDialogError(validation.error);
      return;
    }
    const itemId = selectedItem.id;
    const previousStatus = selectedItem.status;
    void performCorrection({
      key: `cancel:${itemId}`,
      mutate: (accessToken) => cancelOrderItem(itemId, validation.reason, accessToken),
      reconcile: (next) => reconcileCancellation(next.orders, itemId, previousStatus),
      successMessage: `${selectedItem.productName} fue cancelado y sincronizado.`,
    });
  };

  const submitSessionTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "transfer-session" || !snapshot) return;
    if (!sessionTransferPoints.some((point) => point.id === destinationId)) {
      setDialogError("Selecciona un punto de destino libre.");
      return;
    }
    const reasonValidation = validateOptionalReason(reason);
    if (reasonValidation.error) {
      setDialogError(reasonValidation.error);
      return;
    }
    const sessionId = dialog.sessionId;
    const sourcePointId = snapshot.session.servicePoint.id;
    const destinationPoint = sessionTransferPoints.find((point) => point.id === destinationId);
    if (!destinationPoint) return;
    void performCorrection({
      key: `session-transfer:${sessionId}`,
      mutate: (accessToken) => transferServiceSession(
        sessionId,
        {
          toServicePointId: destinationPoint.id,
          ...(reasonValidation.reason ? { reason: reasonValidation.reason } : {}),
        },
        accessToken,
      ),
      reconcile: (next) => reconcileSessionTransfer(
        next.points,
        sessionId,
        sourcePointId,
        destinationPoint.id,
      ),
      successMessage: `La atención fue transferida a ${destinationPoint.name}.`,
    });
  };

  const submitItemTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "transfer-item" || !selectedItem || !snapshot) return;
    const target = itemTransferPoints.find(
      (point) => point.activeSession?.id === destinationId,
    );
    const targetSessionId = target?.activeSession?.id;
    if (!target || !targetSessionId) {
      setDialogError("Selecciona otra atención activa.");
      return;
    }
    const quantityValidation = validateTransferQuantity(quantity, selectedItem.quantity);
    if (quantityValidation.error || quantityValidation.quantity === null) {
      setDialogError(quantityValidation.error);
      return;
    }
    const reasonValidation = validateOptionalReason(reason);
    if (reasonValidation.error) {
      setDialogError(reasonValidation.error);
      return;
    }
    const itemId = selectedItem.id;
    const previousQuantity = selectedItem.quantity;
    const transferredQuantity = quantityValidation.quantity;
    void performCorrection({
      key: `item-transfer:${itemId}`,
      mutate: (accessToken) => transferOrderItem(
        itemId,
        {
          toSessionId: targetSessionId,
          quantity: transferredQuantity,
          ...(reasonValidation.reason ? { reason: reasonValidation.reason } : {}),
        },
        accessToken,
      ),
      reconcile: (next) => reconcileItemTransfer(
        next.orders,
        itemId,
        previousQuantity,
        transferredQuantity,
      ),
      successMessage: `${transferredQuantity}× ${selectedItem.productName} fue transferido a ${target.name}.`,
    });
  };

  const selectedPointId = dialog?.pointId ?? null;
  const pointCountWarning = points && points.length !== 18
    ? `El backend devolvió ${points.length} de 18 puntos esperados.`
    : null;
  const detailTitle = snapshot?.session.servicePoint.name ?? "Atención activa";

  return (
    <div className="tables-page table-operations-page">
      <header className="tables-heading">
        <div>
          <p className="eyebrow">Correcciones operativas</p>
          <h1>Estado de mesas</h1>
          <p>Consulta atenciones y corrige ítems o destinos con el estado real de Logistics.</p>
        </div>
        <Tabs label="Tipo de atención" options={tabs} value={mode} onChange={setMode} />
      </header>

      <CompactToolbarControls>
        <Tabs label="Tipo de atención" options={tabs} value={mode} onChange={setMode} />
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
            <strong>{mode === "salon" ? "Distribución del salón" : "Pedidos para llevar"}</strong>
            <small>
              {points
                ? `${points.filter((point) => point.activeSession).length} atenciones activas · ${permissions.canCancel || permissions.canTransfer ? "Correcciones habilitadas" : "Solo lectura"}`
                : "Consultando Logistics"}
            </small>
          </div>
          <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadStatus()}>
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
            onAction={() => void loadStatus()}
          />
        ) : points && points.length > 0 ? (
          <StatusMap
            mode={mode}
            points={points}
            selectedPointId={selectedPointId}
            onInspect={(point) => void inspectPoint(point)}
          />
        ) : (
          <ErrorState
            title="No hay puntos configurados"
            message="Logistics no devolvió puntos de atención para este local."
            actionLabel="Actualizar"
            onAction={() => void loadStatus()}
          />
        )}
      </section>

      <aside className="status-legend" aria-label="Estados de los puntos de atención">
        <span>Selecciona una atención ocupada</span>
        <StatusBadge status="available" />
        <StatusBadge status="open" />
        <StatusBadge status="payment" />
        <StatusBadge status="inactive" />
      </aside>

      {dialog?.kind === "detail" && (
        <OperationalDialog
          title={detailTitle}
          description="Detalle autoritativo de la atención y sus comandas."
          busy={isDetailLoading}
          onClose={closeDialog}
          footer={
            <>
              {snapshot && canCheckout && (
                <Link className="button button--primary" href={`/cobrar/${snapshot.session.id}`}>
                  Ver cuenta / Cobrar
                </Link>
              )}
              <Button type="button" variant="secondary" loading={isDetailLoading} onClick={() => void refreshDialog()}>
                Actualizar
              </Button>
              <Button type="button" variant="secondary" onClick={closeDialog}>Cerrar</Button>
            </>
          }
        >
          {isDetailLoading && !snapshot ? (
            <LoadingState label="Consultando atención…" />
          ) : dialogError && !snapshot ? (
            <p className="dialog-error" role="alert">{dialogError}</p>
          ) : snapshot ? (
            <div className="table-operations-detail">
              <div className="table-operations-session">
                <div>
                  <strong>{snapshot.session.status === "OPEN" ? "Atención abierta" : "Pendiente de pago"}</strong>
                  <span>Abierta {formatDateTime(snapshot.session.openedAt)}</span>
                </div>
                {permissions.canTransfer && sessionTransferPoints.length > 0 && (
                  <Button type="button" variant="secondary" onClick={beginSessionTransfer}>
                    Transferir atención
                  </Button>
                )}
              </div>
              {!permissions.canCancel && !permissions.canTransfer && (
                <p className="table-operations-readonly">Modo solo lectura</p>
              )}
              {permissions.canTransfer && sessionTransferPoints.length === 0 && (
                <p className="table-operations-hint">No hay puntos libres elegibles para transferir toda la atención.</p>
              )}
              {permissions.canTransfer && itemTransferPoints.length === 0 && (
                <p className="table-operations-hint">No hay otra atención activa elegible para transferir ítems.</p>
              )}
              {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
              <SessionOrders
                orders={snapshot.orders.orders}
                canCancel={permissions.canCancel}
                canTransfer={permissions.canTransfer}
                hasTransferTargets={itemTransferPoints.length > 0}
                onCancel={beginCancel}
                onTransfer={beginItemTransfer}
              />
            </div>
          ) : null}
        </OperationalDialog>
      )}

      {dialog?.kind === "cancel" && selectedItem && (
        <OperationalDialog
          title={`Cancelar ${selectedItem.productName}`}
          description={`Se cancelarán ${selectedItem.quantity} unidad(es). Esta acción quedará auditada.`}
          busy={isMutating}
          onClose={() => returnToDetail()}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={isMutating} onClick={() => returnToDetail()}>
                Volver
              </Button>
              <Button type="submit" form="cancel-item-form" loading={isMutating} disabled={retryBlocked}>
                Confirmar cancelación
              </Button>
            </>
          }
        >
          <form id="cancel-item-form" className="table-operation-form" onSubmit={submitCancel}>
            <label className="field">
              <span className="field__label">Motivo obligatorio</span>
              <textarea className="input table-operation-reason" value={reason} maxLength={500} disabled={isMutating || retryBlocked} onChange={(event) => setReason(event.target.value)} />
            </label>
            {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
          </form>
        </OperationalDialog>
      )}

      {dialog?.kind === "transfer-session" && snapshot && (
        <OperationalDialog
          title={`Transferir atención de ${snapshot.session.servicePoint.name}`}
          description="La sesión completa conservará sus comandas y cambiará de punto."
          busy={isMutating}
          onClose={() => returnToDetail()}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={isMutating} onClick={() => returnToDetail()}>Volver</Button>
              <Button type="submit" form="transfer-session-form" loading={isMutating} disabled={retryBlocked}>Confirmar transferencia</Button>
            </>
          }
        >
          <form id="transfer-session-form" className="table-operation-form" onSubmit={submitSessionTransfer}>
            <SelectField
              id="session-transfer-destination"
              label="Punto libre de destino"
              value={destinationId}
              placeholder="Selecciona un destino"
              required
              disabled={isMutating || retryBlocked}
              options={sessionTransferPoints.map((point) => ({ value: point.id, label: point.name }))}
              onChange={setDestinationId}
            />
            <label className="field">
              <span className="field__label">Motivo opcional</span>
              <textarea className="input table-operation-reason" value={reason} maxLength={500} disabled={isMutating || retryBlocked} onChange={(event) => setReason(event.target.value)} />
            </label>
            {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
          </form>
        </OperationalDialog>
      )}

      {dialog?.kind === "transfer-item" && selectedItem && (
        <OperationalDialog
          title={`Transferir ${selectedItem.productName}`}
          description={`Puedes mover una parte o las ${selectedItem.quantity} unidad(es) disponibles.`}
          busy={isMutating}
          onClose={() => returnToDetail()}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={isMutating} onClick={() => returnToDetail()}>Volver</Button>
              <Button type="submit" form="transfer-item-form" loading={isMutating} disabled={retryBlocked}>Confirmar transferencia</Button>
            </>
          }
        >
          <form id="transfer-item-form" className="table-operation-form" onSubmit={submitItemTransfer}>
            <SelectField
              id="item-transfer-destination"
              label="Atención activa de destino"
              value={destinationId}
              placeholder="Selecciona una atención"
              required
              disabled={isMutating || retryBlocked}
              options={itemTransferPoints.flatMap((point) => point.activeSession
                ? [{ value: point.activeSession.id, label: point.name }]
                : [])}
              onChange={setDestinationId}
            />
            <label className="field">
              <span className="field__label">Cantidad a transferir</span>
              <input className="input" type="number" min={1} max={selectedItem.quantity} step={1} value={quantity} disabled={isMutating || retryBlocked} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Motivo opcional</span>
              <textarea className="input table-operation-reason" value={reason} maxLength={500} disabled={isMutating || retryBlocked} onChange={(event) => setReason(event.target.value)} />
            </label>
            {dialogError && <p className="dialog-error" role="alert">{dialogError}</p>}
          </form>
        </OperationalDialog>
      )}
    </div>
  );
}
