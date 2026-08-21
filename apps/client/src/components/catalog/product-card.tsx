"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { formatPrice } from "@/lib/catalog";
import type { Product } from "@/types/catalog";

interface ProductCardProps {
  product: Product;
  index: number;
  onAdd: (product: Product) => void;
}

export function ProductCard({ product, index, onAdd }: ProductCardProps) {
  const [added, setAdded] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleAdd = () => {
    if (!product.is_available) return;

    onAdd(product);
    setAdded(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setAdded(false), 900);
  };

  return (
    <article
      className="product-card card-enter"
      data-unavailable={!product.is_available}
      style={{ "--card-index": index } as React.CSSProperties}
    >
      {!product.is_available && (
        <span className="availability-badge">No disponible</span>
      )}

      <div className="product-card__visual">
        <div className="product-card__glow" aria-hidden="true" />
        {product.image_url ? (
          <Image
            className="product-card__image"
            src={product.image_url}
            alt={product.name}
            fill
            loading={index === 0 ? "eager" : "lazy"}
            sizes="(max-width: 639px) 88vw, (max-width: 1023px) 44vw, (max-width: 1399px) 29vw, 320px"
          />
        ) : (
          <span className="product-card__no-image">Imagen no disponible</span>
        )}
      </div>

      <div className="product-card__body">
        <div className="product-card__copy">
          <h3>{product.name}</h3>
          {product.description && <p>{product.description}</p>}
        </div>

        <div className="product-card__footer">
          <p className="product-price">
            <span>S/</span> {formatPrice(Number(product.price))}
          </p>
          <button
            type="button"
            className="add-button"
            data-added={added}
            onClick={handleAdd}
            disabled={!product.is_available}
            aria-label={
              product.is_available
                ? `Agregar ${product.name} a mi simulación`
                : `${product.name} no está disponible`
            }
          >
            {added ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12 4 4L19 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            <span>{added ? "Agregado" : "Agregar"}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
