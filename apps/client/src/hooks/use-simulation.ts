"use client";

import { useCallback, useMemo, useState } from "react";

import {
  addSimulationUnit,
  customizeSimulationUnit,
  decrementSimulationLine,
  getSimulationTotal,
  incrementSimulationLine,
  removeSimulationLine,
} from "@/lib/simulation";
import type { Product, SimulationAddition, SimulationItem } from "@/types/catalog";

export function useSimulation() {
  const [items, setItems] = useState<SimulationItem[]>([]);

  const addProduct = useCallback(
    (product: Product, additions: SimulationAddition[] = []) => {
      setItems((currentItems) =>
        addSimulationUnit(currentItems, product, additions),
      );
    },
    [],
  );

  const customizeUnit = useCallback(
    (lineId: string, additions: SimulationAddition[]) => {
      setItems((currentItems) =>
        customizeSimulationUnit(currentItems, lineId, additions),
      );
    },
    [],
  );

  const increment = useCallback((lineId: string) => {
    setItems((currentItems) => incrementSimulationLine(currentItems, lineId));
  }, []);

  const decrement = useCallback((lineId: string) => {
    setItems((currentItems) => decrementSimulationLine(currentItems, lineId));
  }, []);

  const remove = useCallback((lineId: string) => {
    setItems((currentItems) => removeSimulationLine(currentItems, lineId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const itemCount = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );

  const total = useMemo(
    () => getSimulationTotal(items),
    [items],
  );

  return {
    items,
    itemCount,
    total,
    addProduct,
    customizeUnit,
    increment,
    decrement,
    remove,
    clear,
  };
}
