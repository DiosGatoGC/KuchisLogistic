"use client";

import { LOGISTICS_REALTIME_TOPICS } from "@kuchis/shared/logistics-realtime";
import { useCallback, useEffect, useRef, useState } from "react";

import { CompactToolbarControls } from "@/components/layout/compact-toolbar-controls";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { SelectField } from "@/components/ui/select-field";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { useLogisticsRealtime } from "@/features/realtime/use-logistics-realtime";
import { isSessionInvalidError } from "@/lib/api/client";

import {
  getCatalogCategories,
  getCatalogProducts,
  refetchCatalogProducts,
  setProductAvailability,
} from "./catalog-availability-api";
import {
  catalogApiErrorMessage,
  classifyAvailabilityFailure,
} from "./catalog-availability-errors";
import {
  availabilityPayload,
  catalogAvailabilityPermissions,
  filterCatalogProducts,
  normalizeCatalog,
  reconcileProductAvailability,
  runWithProductLock,
} from "./catalog-availability-model";
import { executeAvailabilityAttempt } from "./catalog-availability-mutation";
import type {
  CatalogAvailabilityModel,
  CatalogProductView,
} from "./catalog-availability-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

function stationLabel(station: string) {
  const labels: Record<string, string> = {
    KITCHEN: "Cocina",
    DRINKS: "Bebidas",
    NONE: "Sin estación",
  };
  return labels[station] ?? station;
}

function ProductAvailabilityCard({
  product,
  canMutate,
  isBusy,
  isUnresolved,
  onToggle,
  onVerify,
}: {
  product: CatalogProductView;
  canMutate: boolean;
  isBusy: boolean;
  isUnresolved: boolean;
  onToggle: () => void;
  onVerify: () => void;
}) {
  return (
    <article className="catalog-availability-card" data-available={product.isAvailable}>
      <div className="catalog-availability-card__heading">
        <div>
          <span>{product.categoryName}</span>
          <h2>{product.name}</h2>
        </div>
        <span className="catalog-availability-status">
          {product.isAvailable ? "Disponible" : "No disponible"}
        </span>
      </div>
      <div className="catalog-availability-card__meta">
        <strong>{formatMoney(product.price)}</strong>
        <span>{stationLabel(product.preparationStation)}</span>
      </div>
      {canMutate && (
        isUnresolved ? (
          <Button type="button" variant="secondary" loading={isBusy} onClick={onVerify}>
            Verificar estado
          </Button>
        ) : (
          <Button
            type="button"
            variant={product.isAvailable ? "secondary" : "primary"}
            loading={isBusy}
            onClick={onToggle}
          >
            {product.isAvailable ? "Marcar no disponible" : "Restaurar disponibilidad"}
          </Button>
        )
      )}
    </article>
  );
}

export function CatalogAvailabilityView() {
  const { user, getAccessToken, logout } = useAuth();
  const permissions = catalogAvailabilityPermissions(user?.capabilities ?? []);
  const [catalog, setCatalog] = useState<CatalogAvailabilityModel | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [unresolvedIds, setUnresolvedIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef(0);
  const locksRef = useRef(new Set<string>());

  const handleUnauthorized = useCallback(async (error: unknown) => {
    if (isSessionInvalidError(error)) {
      await logout();
      return true;
    }
    return false;
  }, [logout]);

  const loadCatalog = useCallback(async () => {
    const requestId = ++requestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const accessToken = await getAccessToken();
      const [categoriesResult, productsResult] = await Promise.all([
        getCatalogCategories(accessToken),
        getCatalogProducts(accessToken),
      ]);
      if (requestId !== requestRef.current) return;
      setCatalog(normalizeCatalog(categoriesResult.categories, productsResult.products));
      setUnresolvedIds(new Set());
      setNotice(null);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      if (await handleUnauthorized(error)) return;
      setErrorMessage(catalogApiErrorMessage(error, "No pudimos cargar la carta."));
    } finally {
      if (requestId === requestRef.current) setIsLoading(false);
    }
  }, [
    getAccessToken,
    handleUnauthorized,
    setCatalog,
    setErrorMessage,
    setIsLoading,
    setNotice,
    setUnresolvedIds,
  ]);

  useLogisticsRealtime({
    topics: [LOGISTICS_REALTIME_TOPICS.catalog],
    onInvalidate: () => {
      if (busyIds.size === 0) return loadCatalog();
    },
  });

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadCatalog(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadCatalog]);

  const setBusy = (productId: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const blockProduct = (productId: string) => {
    setUnresolvedIds((current) => new Set(current).add(productId));
  };

  const updateAvailability = async (product: CatalogProductView) => {
    if (!catalog || !permissions.canMutate || unresolvedIds.has(product.id)) return;
    await runWithProductLock(locksRef.current, product.id, async () => {
      const requestedAvailability = !product.isAvailable;
      const payload = availabilityPayload(requestedAvailability);
      setBusy(product.id, true);
      setErrorMessage(null);
      setNotice(null);
      try {
        const accessToken = await getAccessToken();
        const result = await executeAvailabilityAttempt({
          mutate: () => setProductAvailability(
            product.id,
            payload.isAvailable,
            accessToken,
          ),
          refetch: () => refetchCatalogProducts(accessToken),
          classifyFailure: classifyAvailabilityFailure,
        });
        if (result.kind === "confirmed-refetch-failed") {
          blockProduct(product.id);
          setErrorMessage(
            `La solicitud para ${product.name} fue aceptada, pero no pudimos confirmar el estado actual.`,
          );
          return;
        }
        if (result.kind === "unresolved") {
          blockProduct(product.id);
          setErrorMessage(
            `El resultado para ${product.name} es incierto. Verifica antes de intentar otro cambio.`,
          );
          return;
        }
        const nextCatalog = normalizeCatalog(catalog.categories, result.catalog.products);
        setCatalog(nextCatalog);
        const decision = reconcileProductAvailability(
          result.catalog.products,
          product.id,
          product.isAvailable,
          requestedAvailability,
        );
        if (decision === "applied") {
          setNotice(
            `${product.name}: ${requestedAvailability ? "Disponible" : "No disponible"}.`,
          );
        } else if (decision === "unchanged") {
          setErrorMessage(
            `${product.name} conserva su disponibilidad anterior según el catálogo autoritativo.`,
          );
        } else {
          setErrorMessage(`${product.name} ya no aparece en el catálogo autoritativo.`);
        }
      } catch (error) {
        if (await handleUnauthorized(error)) return;
        setErrorMessage(catalogApiErrorMessage(error));
      } finally {
        setBusy(product.id, false);
      }
    });
  };

  if (isLoading && !catalog) {
    return <LoadingState label="Consultando la carta…" />;
  }

  if (!catalog) {
    return (
      <ErrorState
        title="Carta no disponible"
        message={errorMessage ?? "No pudimos consultar el catálogo."}
        actionLabel="Intentar nuevamente"
        onAction={() => void loadCatalog()}
      />
    );
  }

  const visibleProducts = filterCatalogProducts(catalog.products, activeCategory);
  const categoryOptions = [
    { slug: "all", name: "Todos" },
    ...catalog.categories,
  ];

  return (
    <div className="catalog-availability-page">
      <header className="catalog-availability-heading">
        <div>
          <p className="eyebrow">Disponibilidad operativa</p>
          <h1>Actualizar carta</h1>
          <p>Marca productos agotados o vuelve a habilitarlos.</p>
        </div>
        <Button type="button" variant="secondary" loading={isLoading} onClick={() => void loadCatalog()}>
          Actualizar
        </Button>
      </header>

      <CompactToolbarControls>
        <SelectField
          id="catalog-category"
          className="catalog-availability-select"
          label="Categoría"
          value={activeCategory}
          options={categoryOptions.map((category) => ({ value: category.slug, label: category.name }))}
          onChange={setActiveCategory}
        />
      </CompactToolbarControls>

      {(notice || errorMessage) && (
        <div
          className="tables-notice"
          data-tone={errorMessage ? "warning" : "info"}
          role={errorMessage ? "alert" : "status"}
        >
          {errorMessage ?? notice}
        </div>
      )}

      <Surface className="catalog-availability-surface">
        <div className="catalog-availability-toolbar">
          <div className="catalog-availability-filters" role="tablist" aria-label="Filtrar por categoría">
            {categoryOptions.map((category) => (
              <button
                key={category.slug}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.slug}
                onClick={() => setActiveCategory(category.slug)}
              >
                {category.name}
              </button>
            ))}
          </div>
          <span>{visibleProducts.length} productos</span>
        </div>

        {!permissions.canMutate && (
          <p className="table-operations-readonly">Modo solo lectura: la disponibilidad no puede modificarse.</p>
        )}

        {visibleProducts.length > 0 ? (
          <div className="catalog-availability-grid">
            {visibleProducts.map((product) => (
              <ProductAvailabilityCard
                key={product.id}
                product={product}
                canMutate={permissions.canMutate}
                isBusy={busyIds.has(product.id)}
                isUnresolved={unresolvedIds.has(product.id)}
                onToggle={() => void updateAvailability(product)}
                onVerify={() => void loadCatalog()}
              />
            ))}
          </div>
        ) : (
          <p className="catalog-availability-empty">No hay productos en esta categoría.</p>
        )}
      </Surface>
    </div>
  );
}
