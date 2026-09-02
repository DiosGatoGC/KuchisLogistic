export type OperationalStatus = "idle" | "available" | "open" | "payment";

const labels: Record<OperationalStatus, string> = {
  idle: "Sin sincronizar",
  available: "Libre",
  open: "Abierta",
  payment: "Pendiente de pago",
};

const compactLabels: Partial<Record<OperationalStatus, string>> = {
  payment: "Pend. pago",
};

export function StatusBadge({ status }: { status: OperationalStatus }) {
  return (
    <span className="status-badge" data-status={status}>
      <span className="status-badge__dot" aria-hidden="true" />
      <span className="status-badge__label">{labels[status]}</span>
      {compactLabels[status] && (
        <span className="status-badge__label--compact">
          {compactLabels[status]}
        </span>
      )}
    </span>
  );
}
