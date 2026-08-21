"use client";

import { useEffect, useRef, useState } from "react";

import { AdditionalSelector } from "@/components/simulation/additional-selector";
import { SimulationLine } from "@/components/simulation/simulation-line";
import { formatPrice } from "@/lib/catalog";
import type {
  SimulationAddition,
  SimulationAdditionalOption,
  SimulationItem,
} from "@/types/catalog";

const CARD_FEE_RATE = 0.05;

interface SimulationDrawerProps {
  open: boolean;
  items: SimulationItem[];
  additionalOptions: SimulationAdditionalOption[];
  customizableCategoryIds: string[];
  total: number;
  onClose: () => void;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onCustomize: (lineId: string, additions: SimulationAddition[]) => void;
  onClear: () => void;
}

export function SimulationDrawer({
  open,
  items,
  additionalOptions,
  customizableCategoryIds,
  total,
  onClose,
  onIncrement,
  onDecrement,
  onRemove,
  onCustomize,
  onClear,
}: SimulationDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectorOpenRef = useRef(false);
  const [customizingLineId, setCustomizingLineId] = useState<string | null>(
    null,
  );
  const customizingItem = items.find(
    (item) => item.lineId === customizingLineId,
  );
  const cardTotal = total * (1 + CARD_FEE_RATE);

  useEffect(() => {
    selectorOpenRef.current = Boolean(customizingItem);
  }, [customizingItem]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectorOpenRef.current) setCustomizingLineId(null);
        else onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusScope = selectorOpenRef.current
        ? document.querySelector<HTMLElement>(".additional-selector")
        : drawerRef.current;
      const focusableElements = focusScope?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableElements) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  const closeDrawer = () => {
    setCustomizingLineId(null);
    onClose();
  };

  const confirmAdditions = (additions: SimulationAddition[]) => {
    if (!customizingItem) return;
    onCustomize(customizingItem.lineId, additions);
    setCustomizingLineId(null);
  };

  return (
    <div
      className="drawer-root"
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        className="drawer-backdrop"
        onClick={closeDrawer}
        tabIndex={open ? 0 : -1}
        aria-label="Cerrar simulación"
      />

      <section
        ref={drawerRef}
        className="simulation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-title"
      >
        <div className="simulation-drawer__handle" aria-hidden="true" />
        <header className="simulation-drawer__header">
          <div>
            <p className="eyebrow">Tu selección</p>
            <h2 id="simulation-title">Mi simulación</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            onClick={closeDrawer}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="simulation-notice">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v6M12 7.5h.01" />
          </svg>
          <p>
            <strong>Esta es una simulación.</strong> El pedido no ha sido enviado
            al restaurante.
          </p>
        </div>

        <div className="simulation-drawer__content">
          {items.length === 0 ? (
            <div className="simulation-empty">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7M10 20h.01M18 20h.01" />
                </svg>
              </span>
              <h3>Tu simulación está vacía</h3>
              <p>Agrega algo de la carta para calcular tu selección.</p>
            </div>
          ) : (
            <ul className="simulation-list">
              {items.map((item) => (
                <SimulationLine
                  key={item.lineId}
                  item={item}
                  canCustomize={
                    additionalOptions.length > 0 &&
                    customizableCategoryIds.includes(item.product.category_id)
                  }
                  onCustomize={(selectedItem) =>
                    setCustomizingLineId(selectedItem.lineId)
                  }
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="simulation-drawer__footer">
          <div className="simulation-total">
            <div className="simulation-total__primary">
              <span>Total estimado</span>
              <strong>S/ {formatPrice(total)}</strong>
            </div>
            <div className="simulation-total__card">
              <span>Pago con tarjeta (+5%)</span>
              <strong>S/ {formatPrice(cardTotal)}</strong>
            </div>
          </div>
          {items.length > 0 && (
            <button type="button" className="clear-button" onClick={onClear}>
              Limpiar simulación
            </button>
          )}
        </footer>
      </section>

      {customizingItem && (
        <AdditionalSelector
          key={customizingItem.lineId}
          item={customizingItem}
          options={additionalOptions}
          onCancel={() => setCustomizingLineId(null)}
          onConfirm={confirmAdditions}
        />
      )}
    </div>
  );
}
