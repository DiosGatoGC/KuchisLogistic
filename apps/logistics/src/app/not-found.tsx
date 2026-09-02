import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <p className="eyebrow">404</p>
      <h1>Esta página no existe</h1>
      <p>Vuelve al inicio para continuar con tu operación.</p>
      <Link className="back-link" href="/home">Volver al inicio</Link>
    </main>
  );
}
