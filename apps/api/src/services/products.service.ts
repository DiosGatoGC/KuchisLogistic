import { supabase } from "../config/supabase";

export async function getActiveProducts() {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      category_id,
      name,
      description,
      price,
      image_path,
      is_available
    `)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}