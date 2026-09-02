"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";

export function CompactUserMenu({
  fullName,
  roleLabel,
  isLoggingOut,
  onLogout,
}: {
  fullName: string;
  roleLabel: string;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    logoutRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setIsOpen(false);
    await onLogout();
  };

  return (
    <div className="compact-user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="compact-user-menu__trigger"
        aria-label={`Abrir menú de ${fullName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="compact-user-popover"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">{fullName.charAt(0).toUpperCase()}</span>
      </button>

      {isOpen && (
        <div
          id="compact-user-popover"
          className="compact-user-menu__popover"
          role="menu"
          aria-label="Sesión de usuario"
        >
          <div className="compact-user-menu__identity">
            <strong>{fullName}</strong>
            <span>{roleLabel}</span>
          </div>
          <button
            ref={logoutRef}
            type="button"
            role="menuitem"
            className="compact-user-menu__logout"
            disabled={isLoggingOut}
            onClick={handleLogout}
          >
            <Icon name="logout" />
            {isLoggingOut ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
