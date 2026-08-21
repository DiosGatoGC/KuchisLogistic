import { supabase } from "../config/supabase";

export async function getActiveCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}