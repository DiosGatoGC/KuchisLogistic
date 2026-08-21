"use client";

import { useEffect, useRef, useState } from "react";

import { formatPrice } from "@/lib/catalog";

interface FloatingSimulationProps {
  count: number;
  total: number;
  onOpen: () => void;
}

export function FloatingSimulation({
  count,
  total,
  onOpen,
}: FloatingSimulationProps) {
  const [bouncing, setBouncing] = useState(false);
  const previousCount = useRef(count);

  useEffect(() => {
    if (count <= previousCount.current) {
      previousCount.current = count;
      return;
    }

    setBouncing(true);
    const timer = setTimeout(() => setBouncing(false), 350);
    previousCount.current = count;
    return () => clearTimeout(timer);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="floating-simulation">
      <button
        type="button"
        className="floating-simulation__button"
        data-bouncing={bouncing}
        onClick={onOpen}
        aria-label={`Abrir mi simulación, ${count} ${count === 1 ? "producto" : "productos"}`}
      >
        <span className="floating-simulation__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7M10 20h.01M18 20h.01" />
          </svg>
        </span>
        <span className="floating-simulation__label">Mi simulación</span>
        <span className="floating-simulation__count">{count}</span>
        {count > 0 && (
          <span className="floating-simulation__total">
            S/ {formatPrice(total)}
          </span>
        )}
      </button>
    </div>
  );
}
