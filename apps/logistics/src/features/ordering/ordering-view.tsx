"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CompactToolbarControls } from "@/components/layout/compact-toolbar-controls";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { OperationalDialog } from "@/components/ui/operational-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/lib/api/client";
import { storeOrderCreatedFeedback } from "@/lib/order-created-feedback";

import {
  createSessionOrder,
  getCatalogCategories,
  getCatalogProducts,
  getSessionOrders,
} from "./ordering-api";
import {
  isAmbiguousWrite,
  isCatalogChange,
  isSessionChange,
  orderingErrorMessage,
} from "./ordering-errors";
import {
  ADDITIONS_CATEGORY_SLUG,
  addProduct,
  createDraftLine,
  createOrderPayload,
  draftAfterCreate,
  draftTotal,
  EMPTY_DRAFT,
  formatMoney,
  lineTotal,
  MAX_ADDITION_QUANTITY,
  MAX_ITEM_QUANTITY,
  MAX_NOTES_LENGTH,
  productCanBeAdded,
  publicCategories,
  removeDraftLine,
  replaceDraftLine,
  restoreDraft,
  revalidateDraft,
  runWithSubmitLock,
  updateLineQuantity,
  validateDraft,
  visibleProducts,
} from "./ordering-model";
import {
  clearStoredDraft,
  readStoredDraft,
  storeDraft,
} from "./ordering-storage";
import { submitConfirmedOrder } from "./ordering-submit";
import type {
  CatalogCategory,
  CatalogProduct,
  DraftAddition,
  DraftLine,
  DraftOrder,
  Order,
  SessionOrdersResult,
} from "./ordering-types";

interface CustomizationState {
  product: CatalogProduct;
  lineId?: string;
  quantity: number;
  notes: string;
  additions: Record<string, number>;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Hora no disponible";
  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function itemStatusLabel(status: Order["items"][number]["status"]) {
  const labels = {
    PENDING: "Pendiente",
    PREPARING: "En preparación",
    READY: "Listo",
    DELIVERED: "Entregado",
    CANCELLED: "Cancelado",
  } as const;
  return labels[status];
}

function ProductButton({
  product,
  onAdd,
}: {
  product: CatalogProduct;
  onAdd: (product: CatalogProduct) => void;
}) {
  return (
    <button
      type="button"
      className="ordering-product"
      data-available={product.isAvailable}
      disabled={!product.isAvailable}
      aria-label={
        product.isAvailable
          ? `Agregar ${product.name}, ${formatMoney(product.price)}`
          : `${product.name}, no disponible`
      }
      onClick={() => onAdd(product)}
    >
      <strong>{product.name}</strong>
      <span>{formatMoney(product.price)}</span>
      {product.allowsAdditions && product.isAvailable ? (
        <small>+ Adicionales</small>
      ) : !product.isAvailable ? (
        <small className="ordering-product__unavailable">No disponible</small>
      ) : (
        <small>Agregar directo</small>
      )}
    </button>
  );
}

function QuantityControl({
  value,
  min = 1,
  max,
  disabled = false,
  label,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="quantity-control" aria-label={label}>
      <button
        type="button"
        disabled={disabled || value <= min}
        aria-label={`Disminuir ${label}`}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        disabled={disabled || value >= max}
        aria-label={`Aumentar ${label}`}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

function DraftLineCard({
  line,
  disabled,
  onEdit,
  onQuantity,
  onRemove,
}: {
  line: DraftLine;
  disabled: boolean;
  onEdit: () => void;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <article className="draft-line" data-invalid={Boolean(line.invalidReason)}>
      <div className="draft-line__heading">
        <div>
          <strong>{line.quantity}× {line.productName}</strong>
          <span>{formatMoney(lineTotal(line))}</span>
        </div>
        <button type="button" className="draft-line__remove" disabled={disabled} onClick={onRemove}>
          Eliminar
        </button>
      </div>

      {line.additions.length > 0 && (
        <ul className="draft-line__details">
          {line.additions.map((addition) => (
            <li key={addition.productId}>+ {addition.name} ×{addition.quantityPerItem}</li>
          ))}
        </ul>
      )}
      {line.notes && <p className="draft-line__note">“{line.notes}”</p>}
      {line.invalidReason && <p className="draft-line__invalid" role="alert">{line.invalidReason}</p>}

      <div className="draft-line__actions">
        <QuantityControl
          value={line.quantity}
          max={MAX_ITEM_QUANTITY}
          disabled={disabled}
          label={`cantidad de ${line.productName}`}
          onChange={onQuantity}
        />
        <button type="button" className="draft-line__edit" disabled={disabled} onClick={onEdit}>
          Editar
        </button>
      </div>
    </article>
  );
}

function SentOrders({
  orders,
  onClose,
}: {
  orders: readonly Order[];
  onClose: () => void;
}) {
  return (
    <OperationalDialog
      title={`Comandas enviadas (${orders.length})`}
      description="Historial real de esta atención. No forma parte de la nueva comanda."
      onClose={onClose}
      footer={<Button type="button" onClick={onClose}>Volver a Comandar</Button>}
    >
      {orders.length === 0 ? (
        <p className="sent-orders__empty">Esta atención todavía no tiene comandas enviadas.</p>
      ) : (
        <div className="sent-orders">
          {orders.toReversed().map((order) => (
            <article key={order.id} className="sent-order">
              <header>
                <div>
                  <strong>Comanda #{order.sequenceNumber}</strong>
                  <span>{formatTime(order.sentAt)} · {order.createdBy.fullName}</span>
                </div>
                <span>{order.items.length} líneas</span>
              </header>
              {order.notes && <p className="sent-order__note">Nota: {order.notes}</p>}
              <ul>
                {order.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.quantity}× {item.productName}</strong>
                      <span data-status={item.status}>{itemStatusLabel(item.status)}</span>
                    </div>
                    {item.additions.map((addition) => (
                      <small key={addition.productId}>+ {addition.additionName} ×{addition.quantityPerItem}</small>
                    ))}
                    {item.notes && <small>“{item.notes}”</small>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </OperationalDialog>
  );
}

export function OrderingView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { getAccessToken, logout } = useAuth();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [additions, setAdditions] = useState<CatalogProduct[]>([]);
  const [sessionOrders, setSessionOrders] = useState<SessionOrdersResult | null>(null);
  const [draft, setDraft] = useState<DraftOrder>(EMPTY_DRAFT);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customization, setCustomization] = useState<CustomizationState | null>(null);
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSentOrders, setShowSentOrders] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [ambiguousWrite, setAmbiguousWrite] = useState(false);
  const [ambiguousReconciled, setAmbiguousReconciled] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const restoredRef = useRef(false);
  const requestRef = useRef(0);
  const submitLockRef = useRef(false);

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (error instanceof ApiError && error.kind === "unauthorized") {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadAll = useCallback(async (background = false) => {
    const requestId = ++requestRef.current;
    if (background) setIsRefreshing(true);
    else setIsLoading(true);
    setLoadError(null);

    try {
      const accessToken = await getAccessToken();
      const [categoryResult, productResult, additionResult, ordersResult] = await Promise.all([
        getCatalogCategories(accessToken),
        getCatalogProducts(accessToken),
        getCatalogProducts(accessToken, ADDITIONS_CATEGORY_SLUG),
        getSessionOrders(sessionId, accessToken),
      ]);
      if (requestId !== requestRef.current) return;

      setCategories(categoryResult.categories);
      setProducts(productResult.products);
      setAdditions(additionResult.products);
      setSessionOrders(ordersResult);
      setDraft((current) => {
        if (!restoredRef.current) {
          restoredRef.current = true;
          const stored = readStoredDraft(sessionId);
          return stored
            ? revalidateDraft(
                restoreDraft(stored, productResult.products, additionResult.products),
                productResult.products,
                additionResult.products,
              )
            : current;
        }
        return revalidateDraft(current, productResult.products, additionResult.products);
      });
      setIsDraftReady(true);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      if (await handleUnauthorized(error)) return;
      const message = orderingErrorMessage(error, "No pudimos cargar Comandar.");
      if (background) setNotice(message);
      else setLoadError(message);
    } finally {
      if (requestId === requestRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [getAccessToken, handleUnauthorized, sessionId]);

  const refreshOrders = useCallback(async () => {
    const accessToken = await getAccessToken();
    const result = await getSessionOrders(sessionId, accessToken);
    setSessionOrders(result);
    return result;
  }, [getAccessToken, sessionId]);

  const refreshCatalog = useCallback(async () => {
    const accessToken = await getAccessToken();
    const [categoryResult, productResult, additionResult] = await Promise.all([
      getCatalogCategories(accessToken),
      getCatalogProducts(accessToken),
      getCatalogProducts(accessToken, ADDITIONS_CATEGORY_SLUG),
    ]);
    setCategories(categoryResult.categories);
    setProducts(productResult.products);
    setAdditions(additionResult.products);
    setDraft((current) => revalidateDraft(current, productResult.products, additionResult.products));
  }, [getAccessToken]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadAll]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && restoredRef.current) {
        void loadAll(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loadAll]);

  useLayoutEffect(() => {
    if (isDraftReady) storeDraft(sessionId, draft);
  }, [draft, isDraftReady, sessionId]);

  const orderedCategories = useMemo(() => publicCategories(categories), [categories]);
  const filteredProducts = useMemo(
    () => visibleProducts(products, categories, activeCategory, search),
    [activeCategory, categories, products, search],
  );
  const sessionStatus = sessionOrders?.session.status ?? "CANCELLED";
  const canEdit = sessionStatus === "OPEN";
  const validationErrors = useMemo(
    () => validateDraft(draft, sessionStatus),
    [draft, sessionStatus],
  );
  const total = useMemo(() => draftTotal(draft), [draft]);

  const addMainProduct = useCallback((product: CatalogProduct) => {
    if (!productCanBeAdded(product, categories) || !canEdit) return;
    setNotice(null);
    if (product.allowsAdditions) {
      setCustomization({ product, quantity: 1, notes: "", additions: {} });
      setCustomizationError(null);
      return;
    }
    setDraft((current) => addProduct(
      current,
      createDraftLine({ id: crypto.randomUUID(), product }),
    ));
  }, [canEdit, categories]);

  const editDraftLine = useCallback((line: DraftLine) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product || !canEdit) return;
    setCustomization({
      product,
      lineId: line.id,
      quantity: line.quantity,
      notes: line.notes ?? "",
      additions: Object.fromEntries(
        line.additions
          .filter((addition) => additions.some(
            (current) => current.id === addition.productId && current.isAvailable,
          ))
          .map((addition) => [addition.productId, addition.quantityPerItem]),
      ),
    });
    setCustomizationError(null);
  }, [additions, canEdit, products]);

  const saveCustomization = () => {
    if (!customization) return;
    if (!productCanBeAdded(customization.product, categories)) {
      setCustomizationError("Este producto ya no está disponible para agregar.");
      return;
    }
    const note = customization.notes.trim();
    if (note.length > MAX_NOTES_LENGTH) {
      setCustomizationError("La nota no puede superar los 500 caracteres.");
      return;
    }
    const selectedAdditions: DraftAddition[] = customization.product.allowsAdditions
      ? additions.flatMap((addition) => {
          const quantity = customization.additions[addition.id] ?? 0;
          return quantity > 0 && addition.isAvailable
            ? [{
                productId: addition.id,
                name: addition.name,
                unitPrice: addition.price,
                quantityPerItem: quantity,
                isAvailable: true,
              }]
            : [];
        })
      : [];
    const line = createDraftLine({
      id: customization.lineId ?? crypto.randomUUID(),
      product: customization.product,
      quantity: customization.quantity,
      notes: note,
      additions: selectedAdditions,
    });
    setDraft((current) => customization.lineId
      ? replaceDraftLine(current, customization.lineId, line)
      : addProduct(current, line));
    setCustomization(null);
    setCustomizationError(null);
  };

  const reconcileAmbiguousWrite = async () => {
    setIsRefreshing(true);
    try {
      await refreshOrders();
      setAmbiguousReconciled(true);
      setShowSentOrders(true);
    } catch (error) {
      if (await handleUnauthorized(error)) return;
      setNotice("No pudimos consultar las comandas enviadas. No vuelvas a enviar todavía.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const sendOrder = async () => {
    if (validationErrors.length > 0 || isSending) return;
    await runWithSubmitLock(submitLockRef, async () => {
      setIsSending(true);
      setSendError(null);
      try {
        const accessToken = await getAccessToken();
        await submitConfirmedOrder(
          () => createSessionOrder(
            sessionId,
            createOrderPayload(draft),
            accessToken,
          ),
          {
            clearStoredDraft: () => clearStoredDraft(sessionId),
            clearMemoryDraft: () => {
              setDraft((current) => draftAfterCreate(current, true));
              setShowConfirmation(false);
              setAmbiguousWrite(false);
              setAmbiguousReconciled(false);
            },
            prepareFeedback: (sequenceNumber) => {
              storeOrderCreatedFeedback(sequenceNumber);
            },
            replaceWithTables: () => router.replace("/mesas"),
          },
        );
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        if (isAmbiguousWrite(error)) {
          setShowConfirmation(false);
          setAmbiguousWrite(true);
          setAmbiguousReconciled(false);
          setNotice("No pudimos confirmar el resultado del envío. Revisa Enviadas antes de decidir si vuelves a enviar.");
          await reconcileAmbiguousWrite();
          return;
        }
        if (isCatalogChange(error)) {
          try { await refreshCatalog(); } catch { /* Se conserva el draft actual. */ }
        }
        if (isSessionChange(error)) {
          try { await refreshOrders(); } catch { /* El error original sigue visible. */ }
        }
        setSendError(orderingErrorMessage(error, "No se pudo enviar la comanda."));
      } finally {
        setIsSending(false);
      }
    });
  };

  if (isLoading && !sessionOrders) return <LoadingState label="Preparando Comandar…" />;
  if (loadError && !sessionOrders) {
    return (
      <ErrorState
        title="No pudimos abrir Comandar"
        message={loadError}
        actionLabel="Intentar nuevamente"
        onAction={() => void loadAll()}
      />
    );
  }
  if (!sessionOrders) return null;

  return (
    <div className="ordering-page">
      <header className="ordering-heading">
        <div>
          <Link href="/mesas" className="ordering-back">← Mesas</Link>
          <p className="eyebrow">Nueva comanda · No enviada</p>
          <h1>Comandar · {sessionOrders.session.servicePoint.name}</h1>
        </div>
        <div className="ordering-heading__actions">
          <Button type="button" variant="ghost" loading={isRefreshing} onClick={() => void loadAll(true)}>
            Actualizar
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowSentOrders(true)}>
            Enviadas ({sessionOrders.orders.length})
          </Button>
        </div>
      </header>

      <CompactToolbarControls>
        <button type="button" className="compact-sent-button" onClick={() => setShowSentOrders(true)}>
          Enviadas {sessionOrders.orders.length}
        </button>
      </CompactToolbarControls>

      {notice && <div className="ordering-notice" role="status" aria-live="polite">{notice}</div>}
      {!canEdit && (
        <div className="ordering-blocked" role="alert">
          Esta atención ya no está abierta. Puedes consultar las comandas enviadas, pero no crear otra.
        </div>
      )}

      <div className="ordering-workspace">
        <nav className="ordering-panel ordering-categories" aria-label="Categorías del catálogo">
          <div className="ordering-panel__title">
            <strong>Categorías</strong>
            <span>{orderedCategories.length}</span>
          </div>
          <div className="ordering-categories__list">
            <button
              type="button"
              aria-current={activeCategory === "all" ? "page" : undefined}
              onClick={() => setActiveCategory("all")}
            >
              Todos
            </button>
            {orderedCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-current={activeCategory === category.slug ? "page" : undefined}
                onClick={() => setActiveCategory(category.slug)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </nav>

        <section className="ordering-panel ordering-catalog" aria-label="Productos">
          <div className="ordering-catalog__toolbar">
            <label htmlFor="ordering-search">Productos</label>
            <input
              id="ordering-search"
              type="search"
              className="input ordering-search"
              value={search}
              placeholder="Buscar producto"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="ordering-products">
            {filteredProducts.length > 0 ? filteredProducts.map((product) => (
              <ProductButton key={product.id} product={product} onAdd={addMainProduct} />
            )) : (
              <p className="ordering-empty">No hay productos que coincidan.</p>
            )}
          </div>
        </section>

        <aside className="ordering-panel ordering-draft" aria-label="Nueva comanda no enviada">
          <div className="ordering-panel__title">
            <div>
              <strong>Nueva comanda</strong>
              <small>Solo draft no enviado</small>
            </div>
            <span>{draft.lines.reduce((sum, line) => sum + line.quantity, 0)}</span>
          </div>

          <div className="ordering-draft__lines">
            {draft.lines.length === 0 ? (
              <p className="ordering-empty">Agrega productos para crear una nueva comanda.</p>
            ) : draft.lines.map((line) => (
              <DraftLineCard
                key={line.id}
                line={line}
                disabled={!canEdit || isSending}
                onEdit={() => editDraftLine(line)}
                onQuantity={(quantity) => setDraft((current) => updateLineQuantity(current, line.id, quantity))}
                onRemove={() => setDraft((current) => removeDraftLine(current, line.id))}
              />
            ))}
          </div>

          <div className="ordering-draft__footer">
            <label htmlFor="order-notes">Nota general</label>
            <textarea
              id="order-notes"
              className="input ordering-notes"
              value={draft.notes}
              rows={2}
              maxLength={MAX_NOTES_LENGTH}
              disabled={!canEdit || isSending}
              placeholder="Todo junto, primero bebidas…"
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
            <div className="ordering-total">
              <span>Total draft <small>visual</small></span>
              <strong>{formatMoney(total)}</strong>
            </div>
            {validationErrors.length > 0 && draft.lines.length > 0 && (
              <p className="ordering-validation" role="alert">{validationErrors[0]}</p>
            )}
            {ambiguousWrite && ambiguousReconciled && (
              <button
                type="button"
                className="ordering-review-decision"
                onClick={() => {
                  setAmbiguousWrite(false);
                  setAmbiguousReconciled(false);
                  setNotice("Reenvío habilitado por decisión del usuario. Confirma el draft antes de continuar.");
                }}
              >
                Ya revisé Enviadas; habilitar reenvío
              </button>
            )}
            <Button
              type="button"
              className="ordering-send"
              disabled={!canEdit || validationErrors.length > 0 || ambiguousWrite}
              loading={isSending}
              onClick={() => {
                setSendError(null);
                setShowConfirmation(true);
              }}
            >
              Enviar comanda
            </Button>
          </div>
        </aside>
      </div>

      {customization && (
        <OperationalDialog
          title={customization.product.name}
          description={`${formatMoney(customization.product.price)} · Configura esta línea`}
          onClose={() => setCustomization(null)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setCustomization(null)}>Cancelar</Button>
              <Button type="button" onClick={saveCustomization}>{customization.lineId ? "Guardar" : "Agregar"}</Button>
            </>
          }
        >
          <div className="customization">
            <div className="customization__quantity">
              <span>Cantidad del producto</span>
              <QuantityControl
                value={customization.quantity}
                max={MAX_ITEM_QUANTITY}
                label={`cantidad de ${customization.product.name}`}
                onChange={(quantity) => setCustomization((current) => current ? { ...current, quantity } : null)}
              />
            </div>

            {customization.product.allowsAdditions && (
              <section className="customization__additions">
                <h3>Adicionales</h3>
                {additions.length === 0 ? (
                  <p>No hay adicionales disponibles.</p>
                ) : additions.map((addition) => {
                  const quantity = customization.additions[addition.id] ?? 0;
                  return (
                    <div key={addition.id} data-available={addition.isAvailable}>
                      <div>
                        <strong>{addition.name}</strong>
                        <span>+ {formatMoney(addition.price)}</span>
                        {!addition.isAvailable && <small>No disponible</small>}
                      </div>
                      <QuantityControl
                        value={quantity}
                        min={0}
                        max={MAX_ADDITION_QUANTITY}
                        disabled={!addition.isAvailable}
                        label={`cantidad de ${addition.name} por unidad`}
                        onChange={(nextQuantity) => setCustomization((current) => current
                          ? { ...current, additions: { ...current.additions, [addition.id]: nextQuantity } }
                          : null)}
                      />
                    </div>
                  );
                })}
              </section>
            )}

            <label className="customization__note" htmlFor="item-note">
              <span>Nota para cocina</span>
              <textarea
                id="item-note"
                className="input"
                rows={3}
                maxLength={MAX_NOTES_LENGTH}
                value={customization.notes}
                placeholder="Sin cebolla, mayonesa aparte…"
                onChange={(event) => setCustomization((current) => current ? { ...current, notes: event.target.value } : null)}
              />
              <small>{customization.notes.length}/500</small>
            </label>
            {customizationError && <p className="dialog-error" role="alert">{customizationError}</p>}
          </div>
        </OperationalDialog>
      )}

      {showConfirmation && (
        <OperationalDialog
          title="Enviar nueva comanda"
          description="La comanda se registrará como consumo real de esta atención."
          busy={isSending}
          onClose={() => !isSending && setShowConfirmation(false)}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={isSending} onClick={() => setShowConfirmation(false)}>Cancelar</Button>
              <Button type="button" loading={isSending} onClick={() => void sendOrder()}>Enviar</Button>
            </>
          }
        >
          <div className="send-summary">
            <strong>{draft.lines.reduce((sum, line) => sum + line.quantity, 0)} productos</strong>
            <span>{formatMoney(total)}</span>
            <p>Solo se enviará el contenido actual de Nueva comanda.</p>
            {sendError && <p className="dialog-error" role="alert">{sendError}</p>}
          </div>
        </OperationalDialog>
      )}

      {showSentOrders && (
        <SentOrders orders={sessionOrders.orders} onClose={() => setShowSentOrders(false)} />
      )}
    </div>
  );
}
