import type { UserRole } from "@/types/auth";

export type UserStatusFilter = "all" | "active" | "inactive";

export interface ManagedUser {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface ManagedUsersResult {
  users: ManagedUser[];
}

export interface ManagedUserResult {
  user: ManagedUser;
}

export interface CreateManagedUserInput {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

export interface UpdateManagedUserInput {
  fullName?: string;
  username?: string;
  role?: UserRole;
}

export interface ResetPasswordResult {
  success: true;
}
