"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { canAny } from "@/lib/permissions/capabilities";
import type { Capability } from "@/types/auth";
import { useAuth } from "./auth-context";

export function AuthenticatedGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { retryAuthentication, status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  if (status === "unavailable") {
    return (
      <ErrorState
        title="No pudimos validar tu sesión"
        message="Revisa tu conexión y vuelve a intentarlo. Tu sesión local no fue descartada."
        actionLabel="Reintentar"
        onAction={retryAuthentication}
      />
    );
  }

  if (status !== "authenticated") {
    return <LoadingState label="Restaurando tu sesión…" fullScreen />;
  }

  return children;
}

export function PublicOnlyGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { retryAuthentication, status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/home");
  }, [router, status]);

  if (status === "unavailable") {
    return (
      <ErrorState
        title="No pudimos validar tu sesión"
        message="Revisa tu conexión y vuelve a intentarlo antes de iniciar una nueva sesión."
        actionLabel="Reintentar"
        onAction={retryAuthentication}
      />
    );
  }

  if (status === "restoring" || status === "authenticated") {
    return <LoadingState label="Comprobando tu sesión…" fullScreen />;
  }

  return children;
}

export function CapabilityGuard({
  anyOf,
  children,
}: {
  anyOf: readonly Capability[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = useAuth();

  if (!canAny(user, anyOf)) {
    return (
      <ErrorState
        title="Acceso no disponible"
        message="Tu cuenta no tiene permiso para abrir este módulo."
        actionLabel="Volver al inicio"
        onAction={() => router.replace("/home")}
      />
    );
  }

  return children;
}
