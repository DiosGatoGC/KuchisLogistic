"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <main className="not-found-page">
          <p className="eyebrow">Error inesperado</p>
          <h1>Logistics no pudo continuar</h1>
          <p>Reintenta cargar la aplicación para volver a la operación.</p>
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
        </main>
      </body>
    </html>
  );
}
