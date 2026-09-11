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

import { ApiError, apiRequest, isSessionInvalidError } from "@/lib/api/client";
import {
  PUBLIC_FRONTEND_CONFIG,
  publicConfigurationErrorMessage,
} from "@/lib/config/public-config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AuthenticatedUser,
  LoginResult,
  MeResult,
} from "@/types/auth";

type AuthStatus =
  | "restoring"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

interface LoginInput {
  username: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  configurationError: string | null;
  getAccessToken: () => Promise<string>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  retryAuthentication: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const hasPublicConfiguration = PUBLIC_FRONTEND_CONFIG.ok;
const publicConfigurationError = PUBLIC_FRONTEND_CONFIG.ok
  ? null
  : publicConfigurationErrorMessage(PUBLIC_FRONTEND_CONFIG);

async function loadCurrentUser(accessToken: string) {
  return apiRequest<MeResult>("/api/logistics/auth/me", { accessToken });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    hasPublicConfiguration ? "restoring" : "unauthenticated",
  );
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(
    publicConfigurationError,
  );
  const [restoreAttempt, setRestoreAttempt] = useState(0);

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
        if (isSessionInvalidError(error)) {
          const client = getSupabaseBrowserClient();
          await client?.auth.signOut();
          clearAuth();
          return;
        }
        setUser(null);
        setStatus("unavailable");
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
        if (active) {
          setUser(null);
          setStatus("unavailable");
        }
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
  }, [clearAuth, reconcileSession, restoreAttempt]);

  const retryAuthentication = useCallback(() => {
    setStatus("restoring");
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);

  const login = useCallback(async ({ username, password }: LoginInput) => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new ApiError(
        "configuration",
        publicConfigurationError ??
          "Falta configurar la conexión para iniciar sesión.",
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

  const getAccessToken = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      throw new ApiError(
        "configuration",
        publicConfigurationError ??
          "Falta configurar la conexión para consultar Logistics.",
      );
    }

    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) {
      clearAuth();
      throw new ApiError(
        "unauthorized",
        "Tu sesión ya no es válida. Inicia sesión nuevamente.",
        401,
        "AUTH_REQUIRED",
      );
    }

    return data.session.access_token;
  }, [clearAuth]);

  const logout = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    try {
      await client?.auth.signOut();
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo(
    () => ({
      status,
      user,
      configurationError,
      getAccessToken,
      login,
      logout,
      retryAuthentication,
    }),
    [
      configurationError,
      getAccessToken,
      login,
      logout,
      retryAuthentication,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
