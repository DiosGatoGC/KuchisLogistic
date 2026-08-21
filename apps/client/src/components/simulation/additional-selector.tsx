"use client";

import { useMemo, useState } from "react";

import { formatPrice } from "@/lib/catalog";
import { haveSameAdditionIds } from "@/lib/simulation";
import type {
  SimulationAddition,
  SimulationAdditionalOption,
  SimulationItem,
} from "@/types/catalog";

interface AdditionalSelectorProps {
  item: SimulationItem;
  options: SimulationAdditionalOption[];
  onCancel: () => void;
  onConfirm: (additions: SimulationAddition[]) => void;
}

export function AdditionalSelector({
  item,
  options,
  onCancel,
  onConfirm,
}: AdditionalSelectorProps) {
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(item.additions.map((addition) => addition.id)),
  );

  const selectedAdditions = useMemo(
    () =>
      options
        .filter((option) => selectedIds.has(option.id))
        .map(({ id, name, price }) => ({ id, name, price })),
    [options, selectedIds],
  );
  const unchanged = haveSameAdditionIds(
    item.additions,
    selectedAdditions,
  );
  const selectedTotal = selectedAdditions.reduce(
    (total, addition) => total + Number(addition.price),
    0,
  );
  const unitTotal = Number(item.product.price) + selectedTotal;

  const toggleOption = (option: SimulationAdditionalOption) => {
    if (!option.is_available) return;

    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(option.id)) nextIds.delete(option.id);
      else nextIds.add(option.id);
      return nextIds;
    });
  };

  return (
    <div className="additional-selector-root">
      <button
        type="button"
        className="additional-selector-backdrop"
        onClick={onCancel}
        aria-label="Cerrar selector de adicionales"
      />

      <section
        className="additional-selector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="additional-selector-title"
      >
        <div className="additional-selector__handle" aria-hidden="true" />
        <header className="additional-selector__header">
          <div>
            <p className="eyebrow">
              {item.additions.length > 0 ? "Personaliza" : "Hazlo a tu gusto"}
            </p>
            <h2 id="additional-selector-title">
              {item.additions.length > 0
                ? "Editar adicionales"
                : "Agregar adicionales"}
            </h2>
            <p>{item.product.name}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Cerrar"
            autoFocus
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        {item.quantity > 1 && (
          <div className="additional-unit-notice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6M12 7.5h.01" />
            </svg>
            <p>
              Personalizarás <strong>1 de {item.quantity} unidades</strong>. Las
              demás conservarán su configuración actual.
            </p>
          </div>
        )}

        <div className="additional-selector__content">
          <div className="additional-selector__summary">
            <span>Precio base</span>
            <strong>S/ {formatPrice(Number(item.product.price))}</strong>
          </div>

          <div className="additional-options" role="group" aria-label="Adicionales disponibles">
            {options.map((option) => {
              const selected = selectedIds.has(option.id);

              return (
                <button
                  type="button"
                  className="additional-option"
                  data-selected={selected}
                  key={option.id}
                  onClick={() => toggleOption(option)}
                  disabled={!option.is_available}
                  aria-pressed={selected}
                >
                  <span className="additional-option__check" aria-hidden="true">
                    {selected && (
                      <svg viewBox="0 0 24 24">
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                    )}
                  </span>
                  <span className="additional-option__name">
                    <strong>{option.name}</strong>
                    {!option.is_available && <small>No disponible</small>}
                  </span>
                  <span className="additional-option__price">
                    + S/ {formatPrice(Number(option.price))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="additional-selector__footer">
          <div>
            <span>Total por unidad</span>
            <strong>S/ {formatPrice(unitTotal)}</strong>
            {selectedTotal > 0 && (
              <small>+ S/ {formatPrice(selectedTotal)} en adicionales</small>
            )}
          </div>
          <button
            type="button"
            className="confirm-additionals-button"
            onClick={() => onConfirm(selectedAdditions)}
            disabled={unchanged}
          >
            {unchanged ? "Sin cambios" : "Confirmar"}
          </button>
        </footer>
      </section>
    </div>
  );
}
