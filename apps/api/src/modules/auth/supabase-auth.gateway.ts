import { createSupabaseAuthClient } from "../../config/supabase";
import { AppError } from "../../errors/app-error";
import type { PublicSession } from "./auth.types";

export interface AuthenticatedSession {
  authUserId: string;
  session: PublicSession;
}

export interface AuthGateway {
  signInWithPassword(
    email: string,
    password: string
  ): Promise<AuthenticatedSession | null>;
  getUserId(accessToken: string): Promise<string | null>;
}

function isExpectedAuthRejection(status: number | undefined) {
  return status === 400 || status === 401 || status === 403;
}

export const supabaseAuthGateway: AuthGateway = {
  async signInWithPassword(email, password) {
    const authClient = createSupabaseAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.status === 429) {
        throw new AppError(
          429,
          "AUTH_RATE_LIMITED",
          "Demasiados intentos. Inténtalo nuevamente más tarde."
        );
      }

      if (isExpectedAuthRejection(error.status)) {
        return null;
      }

      throw new AppError(
        503,
        "AUTH_PROVIDER_UNAVAILABLE",
        "El servicio de autenticación no está disponible.",
        undefined,
        { cause: error }
      );
    }

    if (!data.user || !data.session) {
      return null;
    }

    return {
      authUserId: data.user.id,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        expiresAt: data.session.expires_at ?? null,
        tokenType: data.session.token_type,
      },
    };
  },

  async getUserId(accessToken) {
    const authClient = createSupabaseAuthClient();
    const { data, error } = await authClient.auth.getUser(accessToken);

    if (error) {
      if (isExpectedAuthRejection(error.status)) {
        return null;
      }

      throw new AppError(
        503,
        "AUTH_PROVIDER_UNAVAILABLE",
        "El servicio de autenticación no está disponible.",
        undefined,
        { cause: error }
      );
    }

    return data.user?.id ?? null;
  },
};
