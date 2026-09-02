"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { useAuth } from "@/features/auth/auth-context";
import { PublicOnlyGuard } from "@/features/auth/auth-guards";
import { ApiError } from "@/lib/api/client";

function loginErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Ocurrió algo inesperado. Inténtalo nuevamente.";
  }

  switch (error.kind) {
    case "unauthorized":
      return "Usuario o contraseña incorrectos.";
    case "rate-limited":
      return "Hay demasiados intentos. Espera un momento antes de reintentar.";
    case "network":
      return "No pudimos conectar. Revisa tu conexión e inténtalo nuevamente.";
    case "server":
      return "El servicio no está disponible temporalmente.";
    case "configuration":
      return "La aplicación aún no tiene configurada la conexión de acceso.";
    default:
      return "No pudimos iniciar sesión. Inténtalo nuevamente.";
  }
}

function LoginForm() {
  const router = useRouter();
  const { login, configurationError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!username || !password) {
      setError("Ingresa tu usuario y contraseña para continuar.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login({ username, password });
      router.replace("/home");
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-page__decor login-page__decor--one" />
      <div className="login-page__decor login-page__decor--two" />

      <div className="login-layout">
        <section className="login-welcome" aria-labelledby="login-title">
          <Brand />
          <p className="eyebrow">Sistema de operación</p>
          <h1 id="login-title">
            ¡Bienvenido a <span>Kuchi&apos;s!</span>
          </h1>
          <p>
            Todo lo que necesitas para acompañar el servicio, en un solo lugar.
          </p>
          <div className="login-welcome__note">
            <span aria-hidden="true">01</span>
            <p>Acceso exclusivo para el equipo de KUCHI&apos;S.</p>
          </div>
        </section>

        <Surface className="login-card">
          <div className="login-card__heading">
            <span className="login-card__icon" aria-hidden="true">
              <Icon name="lock" />
            </span>
            <div>
              <p className="eyebrow">Acceso seguro</p>
              <h2>Inicio de sesión</h2>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <Input
              label="Usuario"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Ingresa tu usuario"
              autoCapitalize="none"
              spellCheck={false}
              disabled={submitting}
            />
            <Input
              label="Contraseña"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Ingresa tu contraseña"
              disabled={submitting}
              trailingAction={
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                  disabled={submitting}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} />
                </button>
              }
            />

            {(error || configurationError) && (
              <div className="login-error" role="alert">
                <span aria-hidden="true">!</span>
                <p>{error ?? configurationError}</p>
              </div>
            )}

            <Button type="submit" className="login-submit" loading={submitting}>
              {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
            </Button>
          </form>
        </Surface>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <PublicOnlyGuard>
      <LoginForm />
    </PublicOnlyGuard>
  );
}
