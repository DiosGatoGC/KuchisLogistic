"use client";

import { useState } from "react";

import { CompactToolbarControls } from "@/components/layout/compact-toolbar-controls";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";

type ServiceMode = "salon" | "takeaway";

const tabs = [
  { value: "salon", label: "Salón" },
  { value: "takeaway", label: "Llevar" },
] as const;

const diningTables = [6, 5, 4, 3, 2, 1, 7] as const;
const barSeats = [4, 3, 2, 1] as const;
const takeawaySlots = [1, 2, 3, 4, 5, 6, 7] as const;

function ServicePoint({
  label,
  kind,
}: {
  label: string;
  kind: "table" | "bar" | "takeaway";
}) {
  return (
    <div className="service-point" data-kind={kind} data-point={label}>
      <span className="service-point__kind">
        {kind === "table" ? "Mesa" : kind === "bar" ? "Barra" : "Llevar"}
      </span>
      <strong>{label}</strong>
      <StatusBadge status="idle" />
    </div>
  );
}

function DiningRoom() {
  return (
    <div className="floor-scroll">
      <div className="dining-map" aria-label="Distribución visual del salón">
        {diningTables.map((number) => (
          <ServicePoint key={number} label={String(number)} kind="table" />
        ))}
        {barSeats.map((number) => (
          <ServicePoint key={`B${number}`} label={`B${number}`} kind="bar" />
        ))}
      </div>
    </div>
  );
}

function TakeawayRoom() {
  return (
    <div className="floor-scroll">
      <div className="takeaway-map" aria-label="Distribución visual de pedidos para llevar">
        {takeawaySlots.map((number) => (
          <ServicePoint
            key={`LL${number}`}
            label={`LL${number}`}
            kind="takeaway"
          />
        ))}
      </div>
    </div>
  );
}

export function TablesView() {
  const [mode, setMode] = useState<ServiceMode>("salon");

  return (
    <div className="tables-page">
      <header className="tables-heading">
        <div>
          <p className="eyebrow">Vista base</p>
          <h1>Mesas</h1>
          <p>La operación de cada punto se habilitará en el siguiente objetivo.</p>
        </div>
        <Tabs
          label="Tipo de atención"
          options={tabs}
          value={mode}
          onChange={setMode}
        />
      </header>

      <CompactToolbarControls>
        <Tabs
          label="Tipo de atención"
          options={tabs}
          value={mode}
          onChange={setMode}
        />
      </CompactToolbarControls>

      <section className="floor-surface">
        <div className="floor-surface__meta">
          <div>
            <strong>{mode === "salon" ? "Distribución del salón" : "Pedidos para llevar"}</strong>
            <small>{mode === "salon" ? "7 mesas · 4 puestos de barra" : "7 espacios de despacho"}</small>
          </div>
          <StatusBadge status="idle" />
        </div>
        {mode === "salon" ? <DiningRoom /> : <TakeawayRoom />}
      </section>

      <aside className="status-legend" aria-label="Estados preparados para las mesas">
        <span>Estados preparados</span>
        <StatusBadge status="available" />
        <StatusBadge status="open" />
        <StatusBadge status="payment" />
      </aside>
    </div>
  );
}
