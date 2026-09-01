import type { Database, Json } from "@kuchis/shared/database-types";
import { supabaseAdmin } from "../../config/supabase";
import { mapRpcError } from "../../database/rpc-errors";
import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";

type Category = Database["public"]["Tables"]["categories"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];

export interface LogisticsCatalogRepository {
  listCategories(): Promise<Category[]>;
  listProducts(categorySlug?: string): Promise<Product[]>;
  setAvailability(
    productId: string,
    isAvailable: boolean,
    actor: AuthenticatedUser
  ): Promise<Json>;
}

function persistenceError(cause: unknown) {
  return new AppError(
    500,
    "CATALOG_PERSISTENCE_FAILED",
    "No se pudo consultar el catálogo.",
    undefined,
    { cause }
  );
}

export const logisticsCatalogRepository: LogisticsCatalogRepository = {
  async listCategories() {
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw persistenceError(error);
    return data;
  },

  async listProducts(categorySlug) {
    let categoryId: string | undefined;
    if (categorySlug) {
      const { data, error } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("slug", categorySlug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw persistenceError(error);
      if (!data) return [];
      categoryId = data.id;
    }

    let query = supabaseAdmin
      .from("products")
      .select("id, category_id, name, description, price, image_path, is_active, is_available, preparation_station, allows_additions, created_at, updated_at")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query;
    if (error) throw persistenceError(error);
    return data;
  },

  async setAvailability(productId, isAvailable, actor) {
    const { data, error } = await supabaseAdmin.rpc(
      "logistics_set_product_availability",
      {
        p_actor_id: actor.id,
        p_actor_role: actor.role,
        p_is_available: isAvailable,
        p_product_id: productId,
      }
    );
    if (error) throw mapRpcError(error, "CATALOG_AVAILABILITY_FAILED");
    return data;
  },
};
