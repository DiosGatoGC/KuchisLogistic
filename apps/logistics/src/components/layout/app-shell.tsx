"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/features/auth/auth-context";
import { Brand } from "./brand";
import { CompactUserMenu } from "./compact-user-menu";
import { PageShell } from "./page-shell";
import { ProtectedNavigationContext } from "./protected-navigation-context";
import {
  LOGISTICS_HISTORY_KEY,
  decideProtectedBack,
  readLogisticsHistoryEntry,
  resolveLogisticsHistoryEntry,
  shouldShowGlobalBack,
  type LogisticsHistoryEntry,
} from "./protected-navigation-model";

const roleLabels = {
  ADMIN: "Administración",
  MANAGER: "Gerencia",
  WAITER: "Salón",
  CASHIER: "Caja",
  KITCHEN: "Cocina",
} as const;

function GlobalBackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="global-back-button"
      aria-label="Volver a la pantalla anterior"
      onClick={onClick}
    >
      <Icon name="arrow-left" />
      <span>Volver</span>
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isGlobalBackSuppressed, setGlobalBackSuppressed] = useState(false);
  const historyEntryRef = useRef<LogisticsHistoryEntry | null>(null);

  useLayoutEffect(() => {
    const storedEntry = readLogisticsHistoryEntry(window.history.state);
    const nextEntry = resolveLogisticsHistoryEntry({
      pathname,
      storedEntry,
      currentEntry: historyEntryRef.current,
      createId: () => window.crypto.randomUUID(),
    });

    if (storedEntry !== nextEntry) {
      window.history.replaceState(
        { ...window.history.state, [LOGISTICS_HISTORY_KEY]: nextEntry },
        "",
      );
    }
    historyEntryRef.current = nextEntry;
  }, [pathname]);

  const fallbackTitle = useMemo(() => {
    const routeTitles: Record<string, string> = {
      "/home": "¿Qué haremos?",
      "/mesas": "Mesas",
      "/estado-mesas": "Estado de mesas",
      "/pedidos": "Pedidos",
      "/carta": "Actualizar carta",
      "/turnos/apertura": "Apertura de turno",
      "/turnos/gastos": "Gastos del turno",
      "/turnos/cierre": "Cierre de turno",
      "/caja/cuadre": "Cuadre de caja",
      "/historial": "Historial",
      "/usuarios": "Usuarios",
    };

    if (pathname.startsWith("/comandar/")) return "Comandar";
    if (pathname.startsWith("/cobrar/")) return "Checkout / Cobro";
    return routeTitles[pathname] ?? "Operación";
  }, [pathname]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleGlobalBack = () => {
    const storedEntry = readLogisticsHistoryEntry(window.history.state);
    const currentEntry = storedEntry?.pathname === pathname
      ? storedEntry
      : historyEntryRef.current;
    const decision = decideProtectedBack(currentEntry);
    if (decision.kind === "history") {
      router.back();
      return;
    }
    router.replace(decision.href);
  };

  const showGlobalBack = shouldShowGlobalBack(pathname, isGlobalBackSuppressed);
  const navigationContextValue = useMemo(
    () => ({ setGlobalBackSuppressed }),
    [setGlobalBackSuppressed],
  );

  return (
    <ProtectedNavigationContext.Provider value={navigationContextValue}>
      <div className="app-root">
        <header className="app-header">
          <PageShell className="app-header__content">
            <div className="app-header__navigation">
              <Brand />
              {showGlobalBack ? <GlobalBackButton onClick={handleGlobalBack} /> : null}
            </div>
            <div className="app-header__session">
              <span className="user-chip">
                <span className="user-chip__avatar" aria-hidden="true">
                  {user?.fullName.charAt(0).toUpperCase()}
                </span>
                <span className="user-chip__copy">
                  <strong>{user?.fullName}</strong>
                  {user && <small>{roleLabels[user.role]}</small>}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                className="logout-button"
                loading={isLoggingOut}
                onClick={handleLogout}
              >
                {!isLoggingOut && <Icon name="logout" />}
                <span className="logout-button__label">Cerrar sesión</span>
              </Button>
            </div>
          </PageShell>
        </header>

        <header className="compact-header">
          <div className="compact-header__content">
            <Brand compact />
            {showGlobalBack ? <GlobalBackButton onClick={handleGlobalBack} /> : null}
            <strong className="compact-header__title">{fallbackTitle}</strong>
            {user && (
              <CompactUserMenu
                fullName={user.fullName}
                roleLabel={roleLabels[user.role]}
                isLoggingOut={isLoggingOut}
                onLogout={handleLogout}
              />
            )}
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>
    </ProtectedNavigationContext.Provider>
  );
}
