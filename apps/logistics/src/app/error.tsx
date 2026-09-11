"use client";

import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="not-found-page">
      <p className="eyebrow">Error inesperado</p>
      <h1>No pudimos mostrar esta pantalla</h1>
      <p>Vuelve a intentarlo. Si el problema continúa, regresa al inicio.</p>
      <Button type="button" onClick={reset}>
        Reintentar
      </Button>
    </main>
  );
}
