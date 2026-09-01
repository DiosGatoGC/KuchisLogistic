import type { Capability } from "../../authorization/capabilities";
import type { UserRole } from "../../authorization/roles";

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  capabilities: Capability[];
}

export interface PublicSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number | null;
  tokenType: string;
}

export interface LoginResult {
  user: AuthenticatedUser;
  session: PublicSession;
}
