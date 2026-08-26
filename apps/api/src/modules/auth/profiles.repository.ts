import type { Database } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { AppError } from "../../errors/app-error";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface ProfilesRepository {
  findByUsername(username: string): Promise<Profile | null>;
  findById(id: string): Promise<Profile | null>;
}

const publicProfileColumns =
  "id, full_name, username, auth_email, role, is_active, created_at, updated_at";

export const profilesRepository: ProfilesRepository = {
  async findByUsername(username) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(publicProfileColumns)
      .eq("username", username)
      .maybeSingle();

    if (error) {
      throw new AppError(
        500,
        "PROFILE_LOOKUP_FAILED",
        "No se pudo consultar el perfil.",
        undefined,
        { cause: error }
      );
    }

    return data;
  },

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(publicProfileColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new AppError(
        500,
        "PROFILE_LOOKUP_FAILED",
        "No se pudo consultar el perfil.",
        undefined,
        { cause: error }
      );
    }

    return data;
  },
};
