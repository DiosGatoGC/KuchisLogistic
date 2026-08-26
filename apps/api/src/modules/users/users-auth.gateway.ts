import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../errors/app-error";

export interface UsersAuthGateway {
  create(email: string, password: string): Promise<string>;
  delete(id: string): Promise<void>;
  updatePassword(id: string, password: string): Promise<void>;
}

function isWeakPasswordError(error: { code?: string } | null) {
  return error?.code === "weak_password";
}

export const usersAuthGateway: UsersAuthGateway = {
  async create(email, password) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      if (isWeakPasswordError(error)) {
        throw new AppError(
          400,
          "PASSWORD_POLICY_REJECTED",
          "La contraseña no cumple la política de seguridad."
        );
      }

      throw new AppError(
        502,
        "AUTH_USER_CREATE_FAILED",
        "No se pudo crear la identidad del usuario.",
        undefined,
        { cause: error }
      );
    }

    return data.user.id;
  },

  async delete(id) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      throw new AppError(
        502,
        "AUTH_USER_DELETE_FAILED",
        "No se pudo revertir la identidad creada.",
        undefined,
        { cause: error }
      );
    }
  },

  async updatePassword(id, password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password,
    });

    if (error) {
      if (isWeakPasswordError(error)) {
        throw new AppError(
          400,
          "PASSWORD_POLICY_REJECTED",
          "La contraseña no cumple la política de seguridad."
        );
      }

      throw new AppError(
        502,
        "AUTH_PASSWORD_UPDATE_FAILED",
        "No se pudo actualizar la contraseña.",
        undefined,
        { cause: error }
      );
    }
  },
};
