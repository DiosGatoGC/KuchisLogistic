"use client";

import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ApiError, apiRequest } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AuthenticatedUser,
  LoginResult,
  MeResult,
} from "@/types/auth";

type AuthStatus = "restoring" | "authenticated" | "unauthenticated";

interface LoginInput {
  username: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  configurationError: string | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const hasSupabaseConfiguration = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
);
const missingSupabaseMessage =
  "Falta configurar Supabase para iniciar y restaurar sesiones.";

async function loadCurrentUser(accessToken: string) {
  return apiRequest<MeResult>("/api/logistics/auth/me", { accessToken });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    hasSupabaseConfiguration ? "restoring" : "unauthenticated",
  );
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(
    hasSupabaseConfiguration ? null : missingSupabaseMessage,
  );

  const clearAuth = useCallback(() => {
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const reconcileSession = useCallback(
    async (session: Session | null) => {
      if (!session?.access_token) {
        clearAuth();
        return;
      }

      try {
        const me = await loadCurrentUser(session.access_token);
        setUser(me.user);
        setStatus("authenticated");
        setConfigurationError(null);
      } catch (error) {
        const client = getSupabaseBrowserClient();
        if (
          error instanceof ApiError &&
          (error.kind === "unauthorized" || error.kind === "forbidden")
        ) {
          await client?.auth.signOut();
        }
        clearAuth();
      }
    },
    [clearAuth],
  );

  useEffect(() => {
    const client = getSupabaseBrowserClient();

    if (!client) {
      return;
    }

    let active = true;

    const restore = async () => {
      const { data, error } = await client.auth.getSession();
      if (!active) return;

      if (error) {
        await client.auth.signOut();
        if (active) clearAuth();
        return;
      }

      await reconcileSession(data.session);
    };

    void restore();

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        clearAuth();
        return;
      }
      if (event === "TOKEN_REFRESHED" && session) {
        window.setTimeout(() => void reconcileSession(session), 0);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [clearAuth, reconcileSession]);

  const login = useCallback(async ({ username, password }: LoginInput) => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new ApiError(
        "configuration",
        "Falta configurar Supabase para iniciar sesión.",
      );
    }

    const result = await apiRequest<LoginResult>(
      "/api/logistics/auth/login",
      {
        method: "POST",
        body: { username, password },
      },
    );

    const { data, error } = await client.auth.setSession({
      access_token: result.session.accessToken,
      refresh_token: result.session.refreshToken,
    });

    if (error || !data.session?.access_token) {
      await client.auth.signOut();
      throw new ApiError(
        "unexpected",
        "No pudimos establecer la sesión. Inténtalo nuevamente.",
      );
    }

    try {
      const me = await loadCurrentUser(data.session.access_token);
      setUser(me.user);
      setStatus("authenticated");
      setConfigurationError(null);
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    try {
      await client?.auth.signOut();
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo(
    () => ({ status, user, configurationError, login, logout }),
    [configurationError, login, logout, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
