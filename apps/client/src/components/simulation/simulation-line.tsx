"use client";

import Image from "next/image";

import { formatPrice } from "@/lib/catalog";
import {
  getSimulationLineTotal,
  getSimulationUnitPrice,
} from "@/lib/simulation";
import type { SimulationItem } from "@/types/catalog";

interface SimulationLineProps {
  item: SimulationItem;
  canCustomize: boolean;
  onCustomize: (item: SimulationItem) => void;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

export function SimulationLine({
  item,
  canCustomize,
  onCustomize,
  onIncrement,
  onDecrement,
  onRemove,
}: SimulationLineProps) {
  const unitPrice = getSimulationUnitPrice(item);
  const lineTotal = getSimulationLineTotal(item);

  return (
    <li className="simulation-item line-enter">
      <div className="simulation-item__image">
        {item.product.image_url && (
          <Image src={item.product.image_url} alt="" fill sizes="64px" />
        )}
      </div>

      <div className="simulation-item__main">
        <div className="simulation-item__top">
          <div>
            <h3>{item.product.name}</h3>
            <p>Precio unitario: S/ {formatPrice(unitPrice)}</p>
          </div>
          <button
            type="button"
            className="remove-button"
            onClick={() => onRemove(item.lineId)}
            aria-label={`Quitar ${item.product.name}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
            </svg>
          </button>
        </div>

        {item.additions.length > 0 && (
          <ul className="simulation-item__additions">
            {item.additions.map((addition) => (
              <li key={addition.id}>
                <span>+ {addition.name}</span>
                <strong>+ S/ {formatPrice(Number(addition.price))}</strong>
              </li>
            ))}
          </ul>
        )}

        {canCustomize && (
          <button
            type="button"
            className="customize-button"
            onClick={() => onCustomize(item)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {item.additions.length > 0
              ? "Editar adicionales"
              : "Agregar adicionales"}
          </button>
        )}

        <div className="simulation-item__bottom">
          <div className="quantity-control">
            <button
              type="button"
              onClick={() => onDecrement(item.lineId)}
              aria-label={`Disminuir cantidad de ${item.product.name}`}
            >
              −
            </button>
            <span aria-label={`Cantidad ${item.quantity}`}>
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => onIncrement(item.lineId)}
              aria-label={`Aumentar cantidad de ${item.product.name}`}
            >
              +
            </button>
          </div>
          <strong>S/ {formatPrice(lineTotal)}</strong>
        </div>
      </div>
    </li>
  );
}
