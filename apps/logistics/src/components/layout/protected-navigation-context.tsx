"use client";

import { createContext, useContext } from "react";

interface ProtectedNavigationContextValue {
  setGlobalBackSuppressed: (suppressed: boolean) => void;
}

export const ProtectedNavigationContext =
  createContext<ProtectedNavigationContextValue | null>(null);

export function useProtectedNavigation() {
  const context = useContext(ProtectedNavigationContext);
  if (!context) {
    throw new Error("useProtectedNavigation debe usarse dentro del shell protegido.");
  }
  return context;
}
