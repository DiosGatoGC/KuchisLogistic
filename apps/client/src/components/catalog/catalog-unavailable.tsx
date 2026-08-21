import Link from "next/link";

import { Header } from "@/components/layout/header";

export function CatalogUnavailable() {
  return (
    <div className="site-root">
      <Header />
      <main className="catalog-state">
        <span className="catalog-state__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 8v4M12 16h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <p className="eyebrow">Carta temporalmente no disponible</p>
        <h1>No pudimos cargar el menú</h1>
        <p>Intenta nuevamente en un momento.</p>
        <Link href="/">Volver a intentar</Link>
      </main>
    </div>
  );
}
