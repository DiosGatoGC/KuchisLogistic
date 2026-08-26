import { getCapabilitiesForRole } from "../../authorization/roles";
import { AppError, forbidden, unauthorized } from "../../errors/app-error";
import type { LoginInput } from "./auth.schemas";
import type { AuthenticatedUser, LoginResult } from "./auth.types";
import {
  profilesRepository,
  type Profile,
  type ProfilesRepository,
} from "./profiles.repository";
import {
  supabaseAuthGateway,
  type AuthGateway,
} from "./supabase-auth.gateway";

function toAuthenticatedUser(profile: Profile): AuthenticatedUser {
  return {
    id: profile.id,
    fullName: profile.full_name,
    username: profile.username,
    role: profile.role,
    capabilities: getCapabilitiesForRole(profile.role),
  };
}

export class AuthService {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly authGateway: AuthGateway
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const profile = await this.profiles.findByUsername(input.username);

    // Use one response for unknown, inactive, and invalid-password attempts to
    // avoid turning the endpoint into a staff-account enumeration oracle.
    if (!profile || !profile.is_active) {
      throw unauthorized(
        "INVALID_CREDENTIALS",
        "Usuario o contraseña incorrectos."
      );
    }

    const authenticated = await this.authGateway.signInWithPassword(
      profile.auth_email,
      input.password
    );

    if (!authenticated) {
      throw unauthorized(
        "INVALID_CREDENTIALS",
        "Usuario o contraseña incorrectos."
      );
    }

    if (authenticated.authUserId !== profile.id) {
      throw new AppError(
        500,
        "AUTH_PROFILE_MISMATCH",
        "La cuenta no está configurada correctamente."
      );
    }

    return {
      user: toAuthenticatedUser(profile),
      session: authenticated.session,
    };
  }

  async getCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
    const userId = await this.authGateway.getUserId(accessToken);

    if (!userId) {
      throw unauthorized("INVALID_ACCESS_TOKEN", "El token no es válido.");
    }

    const profile = await this.profiles.findById(userId);

    if (!profile) {
      throw unauthorized("PROFILE_NOT_FOUND", "El perfil no está disponible.");
    }

    if (!profile.is_active) {
      throw forbidden(
        "ACCOUNT_INACTIVE",
        "La cuenta está inactiva. Contacta a un administrador."
      );
    }

    return toAuthenticatedUser(profile);
  }
}

export const authService = new AuthService(
  profilesRepository,
  supabaseAuthGateway
);
