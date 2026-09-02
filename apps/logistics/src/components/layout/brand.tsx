import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/home" aria-label="Kuchi's Logistics, inicio">
      <span className="brand__mark" aria-hidden="true">
        K<span />
      </span>
      {!compact && (
        <span className="brand__copy">
          <strong>KUCHI&apos;S</strong>
          <small>Logistics</small>
        </span>
      )}
    </Link>
  );
}
