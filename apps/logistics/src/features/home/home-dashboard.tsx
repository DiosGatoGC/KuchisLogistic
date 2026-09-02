"use client";

import type { IconName } from "@/components/ui/icon";
import { useAuth } from "@/features/auth/auth-context";
import { canAny } from "@/lib/permissions/capabilities";
import type { Capability } from "@/types/auth";
import { ActionTile } from "./action-tile";

interface HomeAction {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  anyOf: readonly Capability[];
  secondary?: boolean;
}

const actions: readonly HomeAction[] = [
  {
    href: "/mesas",
    icon: "tables",
    title: "Mesas",
    description: "Salón y pedidos para llevar",
    anyOf: ["tables.view", "tables.operate"],
  },
  {
    href: "/estado-mesas",
    icon: "eye",
    title: "Estado de mesas",
    description: "Vista general del servicio",
    anyOf: ["tables.operate"],
  },
  {
    href: "/pedidos",
    icon: "orders",
    title: "Pedidos",
    description: "Cocina y bebidas",
    anyOf: [
      "orders.kitchen.view",
      "orders.kitchen.manage",
      "orders.drinks.view",
      "orders.drinks.manage",
    ],
  },
  {
    href: "/carta",
    icon: "book-open",
    title: "Actualizar carta",
    description: "Disponibilidad de productos",
    anyOf: ["catalog.availability"],
  },
  {
    href: "/turnos/apertura",
    icon: "clock-in",
    title: "Apertura de turno",
    description: "Iniciar una jornada",
    anyOf: ["shift.open"],
  },
  {
    href: "/turnos/cierre",
    icon: "clock-out",
    title: "Cierre de turno",
    description: "Finalizar la jornada",
    anyOf: ["shift.close"],
  },
  {
    href: "/caja/cuadre",
    icon: "cash",
    title: "Cuadre de caja",
    description: "Reconciliar los movimientos",
    anyOf: ["cash.reconcile"],
  },
  {
    href: "/historial",
    icon: "history",
    title: "Historial",
    description: "Consultar actividad anterior",
    anyOf: ["history.view"],
  },
  {
    href: "/usuarios",
    icon: "users",
    title: "Usuarios",
    description: "Administrar al equipo",
    anyOf: ["users.manage"],
    secondary: true,
  },
];

export function HomeDashboard() {
  const { user } = useAuth();
  const visibleActions = actions.filter((action) => canAny(user, action.anyOf));
  const primaryActions = visibleActions.filter((action) => !action.secondary);
  const secondaryActions = visibleActions.filter((action) => action.secondary);

  return (
    <div className="home-page">
      <header className="home-heading">
        <p className="eyebrow">Panel de operación</p>
        <h1>¿Qué haremos?</h1>
        <p>Elige una tarea para comenzar.</p>
      </header>

      <div className="action-grid">
        {primaryActions.map((action) => (
          <ActionTile key={action.href} {...action} />
        ))}
      </div>

      {secondaryActions.length > 0 && (
        <div className="home-secondary">
          <p>Administración</p>
          {secondaryActions.map((action) => (
            <ActionTile key={action.href} {...action} accent />
          ))}
        </div>
      )}
    </div>
  );
}
