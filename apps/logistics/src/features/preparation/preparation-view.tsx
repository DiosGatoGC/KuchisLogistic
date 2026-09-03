"use client";

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
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";

import {
  deliverOrderItem,
  getPreparationQueue,
  readyOrderItem,
  startOrderItem,
} from "./preparation-api";
import {
  preparationErrorMessage,
  transitionFailureKind,
} from "./preparation-errors";
import {
  formatElapsed,
  getPreparationAgeLevel,
  groupPreparationItems,
  itemsForStation,
  nextPreparationAction,
  preparationActionLabels,
  preparationGroupLabels,
  preparationStationLabels,
  preparationStationsForCapabilities,
  preparationStatusLabels,
  queueItemIdentity,
  reconcileTransition,
  runWithItemLock,
  stationPermissions,
  PREPARATION_STATUSES,
} from "./preparation-model";
import { executeTransitionAttempt } from "./preparation-transition";
import type {
  PreparationAction,
  PreparationQueueItem,
  PreparationStation,
} from "./preparation-types";

type Notice = { tone: "success" | "warning"; message: string };

function transitionRequest(
  action: PreparationAction,
  orderItemId: string,
  accessToken: string,
) {
  if (action === "start") return startOrderItem(orderItemId, accessToken);
  if (action === "ready") return readyOrderItem(orderItemId, accessToken);
  return deliverOrderItem(orderItemId, accessToken);
}

function PreparationCard({
  item,
  canManage,
  busy,
  nowMs,
  onTransition,
}: {
  item: PreparationQueueItem;
  canManage: boolean;
  busy: boolean;
  nowMs: number;
  onTransition: (item: PreparationQueueItem) => void;
}) {
  const { orderItem } = item;
  const action = nextPreparationAction(orderItem.status);
  const actionId = `preparation-action-${encodeURIComponent(orderItem.id)}`;

  return (
    <article
      className="preparation-card"
      data-item-id={orderItem.id}
      data-status={orderItem.status.toLowerCase()}
      data-age-level={getPreparationAgeLevel(
        item.order.sentAt,
        nowMs,
      ).toLowerCase()}
    >
      <header className="preparation-card__header">
        <div>
          <strong>{queueItemIdentity(item)}</strong>
          <span>{formatElapsed(item.order.sentAt, nowMs)}</span>
        </div>
        <span className="preparation-status">
          {preparationStatusLabels[orderItem.status]}
        </span>
      </header>

      <div className="preparation-card__product">
        <strong>{orderItem.quantity}×</strong>
        <span>{orderItem.productName}</span>
      </div>

      {item.additions.length > 0 && (
        <ul className="preparation-card__additions" aria-label="Adiciones">
          {item.additions.map((addition) => (
            <li key={`${addition.productId}-${addition.additionName}`}>
              + {addition.quantityPerItem}× {addition.additionName}
            </li>
          ))}
        </ul>
      )}

      {orderItem.notes && (
        <p className="preparation-card__notes">
          <span>Nota</span>
          {orderItem.notes}
        </p>
      )}

      <footer className="preparation-card__footer">
        {canManage ? (
          <Button
            id={actionId}
            type="button"
            className="preparation-card__action"
            loading={busy}
            disabled={busy}
            onClick={() => onTransition(item)}
          >
            {busy ? "Actualizando" : preparationActionLabels[action]}
          </Button>
        ) : (
          <span className="preparation-card__readonly">Solo lectura</span>
        )}
      </footer>
    </article>
  );
}

export function PreparationView() {
  const { user, getAccessToken, logout } = useAuth();
  const stations = useMemo(
    () => preparationStationsForCapabilities(user?.capabilities ?? []),
    [user?.capabilities],
  );
  const [activeStation, setActiveStation] = useState<PreparationStation>(
    stations[0] ?? "KITCHEN",
  );
  const [items, setItems] = useState<PreparationQueueItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyItemIds, setBusyItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState(0);
  const requestRef = useRef(0);
  const itemLocksRef = useRef(new Set<string>());
  const itemsRef = useRef<PreparationQueueItem[] | null>(null);
  const activeStationRef = useRef(activeStation);
  const focusAfterRefreshRef = useRef<string | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setClockNowMs(Date.now()),
      60_000,
    );
    return () => window.clearInterval(intervalId);
  }, []);

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

  const loadQueue = useCallback(
    async (
      station: PreparationStation,
      { background = false }: { background?: boolean } = {},
    ) => {
      const requestId = ++requestRef.current;
      if (background) setIsRefreshing(true);
      else setIsLoading(true);
      setLoadError(null);

      try {
        const accessToken = await getAccessToken();
        const result = await getPreparationQueue(station, accessToken);
        const stationItems = itemsForStation(result.items, station);
        if (
          requestId !== requestRef.current ||
          activeStationRef.current !== station
        ) {
          return null;
        }
        itemsRef.current = stationItems;
        setItems(stationItems);
        const synchronizedAt = Date.now();
        setLoadedAt(synchronizedAt);
        setClockNowMs(synchronizedAt);
        return stationItems;
      } catch (error) {
        if (requestId !== requestRef.current) return null;
        if (await handleUnauthorized(error)) return null;
        const message = preparationErrorMessage(
          error,
          `No pudimos cargar ${preparationStationLabels[station]}.`,
        );
        if (background && itemsRef.current !== null) {
          setNotice({ tone: "warning", message });
        } else {
          setLoadError(message);
        }
        return null;
      } finally {
        if (requestId === requestRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [getAccessToken, handleUnauthorized],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(
      () => void loadQueue(activeStation),
      0,
    );
    return () => window.clearTimeout(initialLoad);
  }, [activeStation, loadQueue]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && itemsRef.current !== null) {
        void loadQueue(activeStationRef.current, { background: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadQueue]);

  useEffect(() => {
    const orderItemId = focusAfterRefreshRef.current;
    if (!orderItemId || isRefreshing) return;
    focusAfterRefreshRef.current = null;
    const action = document.getElementById(
      `preparation-action-${encodeURIComponent(orderItemId)}`,
    );
    if (action instanceof HTMLButtonElement) action.focus();
  }, [isRefreshing, items]);

  const changeStation = (station: PreparationStation) => {
    if (station === activeStation) return;
    requestRef.current += 1;
    activeStationRef.current = station;
    itemsRef.current = null;
    setActiveStation(station);
    setItems(null);
    setLoadError(null);
    setNotice(null);
    setLoadedAt(null);
  };

  const transitionItem = useCallback(
    (item: PreparationQueueItem) => {
      const station = item.orderItem.preparationStation;
      const action = nextPreparationAction(item.orderItem.status);
      const itemId = item.orderItem.id;

      void runWithItemLock(itemLocksRef.current, itemId, async () => {
        setBusyItemIds((current) => new Set(current).add(itemId));
        setNotice(null);

        try {
          const accessToken = await getAccessToken();
          const result = await executeTransitionAttempt({
            mutate: () => transitionRequest(action, itemId, accessToken),
            refetch: async () => {
              const response = await getPreparationQueue(station, accessToken);
              return itemsForStation(response.items, station);
            },
            classifyFailure: transitionFailureKind,
          });

          if (activeStationRef.current !== station) return;

          if (result.kind === "confirmed") {
            itemsRef.current = result.items;
            setItems(result.items);
            const synchronizedAt = Date.now();
            setLoadedAt(synchronizedAt);
            setClockNowMs(synchronizedAt);
            focusAfterRefreshRef.current = itemId;
            setNotice({
              tone: "success",
              message: `${item.orderItem.productName} quedó sincronizado.`,
            });
            return;
          }

          if (result.kind === "confirmed-refresh-failed") {
            setNotice({
              tone: "warning",
              message:
                "La acción fue aceptada, pero no pudimos actualizar la cola. Usa Actualizar antes de continuar.",
            });
            return;
          }

          if (result.kind === "reconciliation-failed") {
            setNotice({
              tone: "warning",
              message:
                "No pudimos confirmar el resultado. Actualiza la cola antes de decidir si vuelves a intentarlo.",
            });
            return;
          }

          itemsRef.current = result.items;
          setItems(result.items);
          const synchronizedAt = Date.now();
          setLoadedAt(synchronizedAt);
          setClockNowMs(synchronizedAt);
          const reconciliation = reconcileTransition(
            itemId,
            action,
            result.items,
          );
          if (reconciliation === "applied") {
            setNotice({
              tone: "success",
              message: "La cola confirma que la acción sí fue aplicada.",
            });
          } else if (reconciliation === "unchanged") {
            focusAfterRefreshRef.current = itemId;
            setNotice({
              tone: "warning",
              message:
                "La cola sigue sin cambios. Revisa el ítem antes de volver a intentarlo.",
            });
          } else {
            setNotice({
              tone: "warning",
              message: "El ítem cambió en otro dispositivo y la cola fue actualizada.",
            });
          }
        } catch (error) {
          if (await handleUnauthorized(error)) return;
          setNotice({
            tone: "warning",
            message: preparationErrorMessage(error),
          });
        } finally {
          setBusyItemIds((current) => {
            const next = new Set(current);
            next.delete(itemId);
            return next;
          });
        }
      });
    },
    [getAccessToken, handleUnauthorized],
  );

  const permissions = stationPermissions(
    user?.capabilities ?? [],
    activeStation,
  );
  const groups = useMemo(() => groupPreparationItems(items ?? []), [items]);
  const tabOptions = stations.map((station) => ({
    value: station,
    label: preparationStationLabels[station],
  }));
  const lastUpdated = loadedAt
    ? new Intl.DateTimeFormat("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(loadedAt)
    : null;

  return (
    <section className="preparation-page">
      <CompactToolbarControls>
        <Tabs
          label="Estación de preparación"
          options={tabOptions}
          value={activeStation}
          onChange={changeStation}
        />
      </CompactToolbarControls>

      <div className="preparation-heading">
        <div>
          <p className="eyebrow">Flujo de preparación</p>
          <h1>Pedidos</h1>
          <p>
            Cocina y bebidas, sincronizadas con el estado confirmado por
            Logistics.
          </p>
        </div>
        <div className="preparation-heading__actions">
          {lastUpdated && <span>Actualizado {lastUpdated}</span>}
          <Button
            type="button"
            variant="secondary"
            loading={isRefreshing}
            onClick={() =>
              void loadQueue(activeStation, { background: items !== null })
            }
          >
            Actualizar
          </Button>
          <Tabs
            label="Estación de preparación"
            options={tabOptions}
            value={activeStation}
            onChange={changeStation}
          />
        </div>
      </div>

      {notice && (
        <div
          className="preparation-notice"
          data-tone={notice.tone}
          role="status"
          aria-live="polite"
        >
          {notice.message}
        </div>
      )}

      {isLoading && items === null ? (
        <LoadingState
          label={`Cargando ${preparationStationLabels[activeStation]}…`}
        />
      ) : loadError && items === null ? (
        <ErrorState
          title={`No pudimos cargar ${preparationStationLabels[activeStation]}`}
          message={loadError}
          actionLabel="Reintentar"
          onAction={() => void loadQueue(activeStation)}
        />
      ) : items?.length === 0 ? (
        <div className="preparation-empty" role="status">
          <span aria-hidden="true">✓</span>
          <h2>Sin pedidos en espera</h2>
          <p>
            No hay pedidos pendientes en {preparationStationLabels[activeStation]}.
          </p>
          <Button
            type="button"
            variant="secondary"
            loading={isRefreshing}
            onClick={() =>
              void loadQueue(activeStation, { background: true })
            }
          >
            Actualizar
          </Button>
        </div>
      ) : (
        <div className="preparation-scroll">
          <div
            className="preparation-board"
            aria-label={`Cola de ${preparationStationLabels[activeStation]}`}
          >
            {PREPARATION_STATUSES.map((status) => (
              <section
                className="preparation-lane"
                data-status={status.toLowerCase()}
                key={status}
              >
                <header className="preparation-lane__header">
                  <div>
                    <span aria-hidden="true" />
                    <h2>{preparationGroupLabels[status]}</h2>
                  </div>
                  <strong aria-label={`${groups[status].length} ítems`}>
                    {groups[status].length}
                  </strong>
                </header>
                <div className="preparation-lane__body">
                  {groups[status].length === 0 ? (
                    <p className="preparation-lane__empty">Sin ítems</p>
                  ) : (
                    groups[status].map((item) => (
                      <PreparationCard
                        key={item.orderItem.id}
                        item={item}
                        canManage={permissions.canManage}
                        busy={busyItemIds.has(item.orderItem.id)}
                        nowMs={clockNowMs}
                        onTransition={transitionItem}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
