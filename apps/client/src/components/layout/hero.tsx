const RESTAURANT_MAPS_URL =
  "https://maps.app.goo.gl/kVP2yP3tokvZNbYv5";

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="page-shell hero__content">
        <div>
          <p className="eyebrow">Bienvenido a Kuchi&apos;s</p>
          <h1 id="hero-title">¿Qué se te antoja hoy?</h1>
          <p className="hero__copy">
            Explora nuestra carta y arma una simulación a tu gusto.
          </p>
        </div>

        <a
          className="hero__note"
          href={RESTAURANT_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir ubicación de KUCHI'S en Google Maps"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
            <circle cx="12" cy="9" r="2.25" />
          </svg>
          <span className="hero__note-copy">
            <strong>Carta en restaurante</strong>
            <small>Consulta precios y disponibilidad</small>
            <span className="hero__note-action">
              Ubícanos
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </span>
        </a>
      </div>
    </section>
  );
}
