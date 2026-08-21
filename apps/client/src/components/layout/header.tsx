import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Header() {
  return (
    <header className="site-header">
      <div className="page-shell site-header__content">
        <a className="brand" href="#inicio" aria-label="Kuchi's, volver al inicio">
          <BrandMark />
          <span>
            <strong className="brand__name">KUCHI&apos;S</strong>
            <span className="brand__tagline">Carta digital · Hecho al momento</span>
          </span>
        </a>

        <div className="site-header__actions">
          <span className="theme-label">Tu tema</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
