import { apiRequest } from "@/lib/api/client";

import { resetPasswordPayload, usersListPath } from "./users-model";
import type {
  CreateManagedUserInput,
  ManagedUserResult,
  ManagedUsersResult,
  ResetPasswordResult,
  UpdateManagedUserInput,
  UserStatusFilter,
} from "./users-types";

export function getManagedUsers(status: UserStatusFilter, accessToken: string) {
  return apiRequest<ManagedUsersResult>(usersListPath(status), { accessToken });
}

export function getManagedUser(userId: string, accessToken: string) {
  return apiRequest<ManagedUserResult>(`/api/logistics/users/${encodeURIComponent(userId)}`, { accessToken });
}

export function createManagedUser(input: CreateManagedUserInput, accessToken: string) {
  return apiRequest<ManagedUserResult>("/api/logistics/users", {
    method: "POST",
    accessToken,
    body: input,
    expectedStatus: 201,
  });
}

export function updateManagedUser(userId: string, input: UpdateManagedUserInput, accessToken: string) {
  return apiRequest<ManagedUserResult>(`/api/logistics/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    accessToken,
    body: input,
  });
}

export function setManagedUserActive(userId: string, isActive: boolean, accessToken: string) {
  const action = isActive ? "activate" : "deactivate";
  return apiRequest<ManagedUserResult>(`/api/logistics/users/${encodeURIComponent(userId)}/${action}`, {
    method: "POST",
    accessToken,
  });
}

export function resetManagedUserPassword(userId: string, newPassword: string, accessToken: string) {
  return apiRequest<ResetPasswordResult>(`/api/logistics/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    accessToken,
    body: resetPasswordPayload(newPassword),
  });
}
