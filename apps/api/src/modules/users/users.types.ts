import type { UserRole } from "../../authorization/roles";

export interface PublicManagedUser {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export type UserStatusFilter = "active" | "inactive";

export interface CreateUserInput {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

export interface UpdateUserInput {
  fullName?: string;
  username?: string;
  role?: UserRole;
}
