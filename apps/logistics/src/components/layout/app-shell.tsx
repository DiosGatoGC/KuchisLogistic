"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/features/auth/auth-context";
import { Brand } from "./brand";
import { CompactUserMenu } from "./compact-user-menu";
import { PageShell } from "./page-shell";

const roleLabels = {
  ADMIN: "Administración",
  MANAGER: "Gerencia",
  WAITER: "Salón",
  CASHIER: "Caja",
  KITCHEN: "Cocina",
} as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fallbackTitle = useMemo(() => {
    const routeTitles: Record<string, string> = {
      "/home": "¿Qué haremos?",
      "/mesas": "Mesas",
      "/estado-mesas": "Estado de mesas",
      "/pedidos": "Pedidos",
      "/carta": "Actualizar carta",
      "/turnos/apertura": "Apertura de turno",
      "/turnos/cierre": "Cierre de turno",
      "/caja/cuadre": "Cuadre de caja",
      "/historial": "Historial",
      "/usuarios": "Usuarios",
    };

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

  return (
    <div className="app-root">
      <header className="app-header">
        <PageShell className="app-header__content">
          <Brand />
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
  );
}
