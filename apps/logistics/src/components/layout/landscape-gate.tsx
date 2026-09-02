"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";

const phonePortraitQuery =
  "(orientation: portrait) and (pointer: coarse) and (max-width: 767px)";

export function LandscapeGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(phonePortraitQuery);
    const update = () => setBlocked(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (blocked) {
    return (
      <div className="rotate-gate" role="status" aria-live="polite">
        <span className="rotate-gate__icon">
          <Icon name="rotate" />
        </span>
        <p className="eyebrow">Vista de operación</p>
        <h1>Gira tu dispositivo</h1>
        <p>para utilizar KUCHI&apos;S Logístico</p>
      </div>
    );
  }

  return children;
}
