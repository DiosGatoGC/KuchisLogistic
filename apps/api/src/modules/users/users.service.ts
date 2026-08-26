import { randomUUID } from "node:crypto";
import { AppError } from "../../errors/app-error";
import type {
  CreateUserInput,
  PublicManagedUser,
  UpdateUserInput,
  UserStatusFilter,
} from "./users.types";
import {
  usersAuthGateway,
  type UsersAuthGateway,
} from "./users-auth.gateway";
import {
  usersRepository,
  type ManagedProfile,
  type UsersRepository,
} from "./users.repository";

function toPublicUser(profile: ManagedProfile): PublicManagedUser {
  return {
    id: profile.id,
    fullName: profile.full_name,
    username: profile.username,
    role: profile.role,
    isActive: profile.is_active,
    createdAt: profile.created_at,
  };
}

function userNotFound() {
  return new AppError(404, "USER_NOT_FOUND", "El usuario no existe.");
}

export function generateInternalAuthEmail() {
  return `worker.${randomUUID().replaceAll("-", "")}@users.kuchis.invalid`;
}

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly authGateway: UsersAuthGateway,
    private readonly emailFactory: () => string = generateInternalAuthEmail
  ) {}

  async list(status?: UserStatusFilter) {
    const profiles = await this.repository.list(status);
    return profiles.map(toPublicUser);
  }

  async getById(id: string) {
    const profile = await this.repository.findById(id);
    if (!profile) throw userNotFound();
    return toPublicUser(profile);
  }

  async create(input: CreateUserInput) {
    if (await this.repository.findByUsername(input.username)) {
      throw new AppError(
        409,
        "USERNAME_ALREADY_EXISTS",
        "El nombre de usuario ya está en uso."
      );
    }

    const authEmail = this.emailFactory();
    const authUserId = await this.authGateway.create(authEmail, input.password);

    try {
      const profile = await this.repository.create({
        id: authUserId,
        full_name: input.fullName,
        username: input.username,
        auth_email: authEmail,
        role: input.role,
        is_active: input.isActive,
      });
      return toPublicUser(profile);
    } catch (profileError) {
      try {
        await this.authGateway.delete(authUserId);
      } catch (compensationError) {
        throw new AppError(
          500,
          "USER_CREATION_COMPENSATION_FAILED",
          "La creación del usuario quedó incompleta y requiere revisión.",
          undefined,
          { cause: compensationError }
        );
      }
      throw profileError;
    }
  }

  async update(id: string, input: UpdateUserInput) {
    const current = await this.repository.findById(id);
    if (!current) throw userNotFound();

    if (
      input.username !== undefined &&
      input.username !== current.username &&
      (await this.repository.findByUsername(input.username))
    ) {
      throw new AppError(
        409,
        "USERNAME_ALREADY_EXISTS",
        "El nombre de usuario ya está en uso."
      );
    }

    const updated = await this.repository.update(id, input);
    if (!updated) throw userNotFound();
    return toPublicUser(updated);
  }

  async setActive(id: string, isActive: boolean) {
    const profile = await this.repository.setActive(id, isActive);
    if (!profile) throw userNotFound();
    return toPublicUser(profile);
  }

  async resetPassword(id: string, newPassword: string) {
    if (!(await this.repository.findById(id))) throw userNotFound();
    await this.authGateway.updatePassword(id, newPassword);
  }
}

export const usersService = new UsersService(usersRepository, usersAuthGateway);
