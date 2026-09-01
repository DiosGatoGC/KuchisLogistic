import { supabaseAdmin } from "../config/supabase";

export async function getActiveProducts(categorySlug?: string) {
  let categoryId: string | undefined;

  if (categorySlug) {
    const { data: category, error: categoryError } = await supabaseAdmin
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .eq("is_active", true)
      .maybeSingle();

    if (categoryError) {
      throw new Error(categoryError.message);
    }

    if (!category) {
      return [];
    }

    categoryId = category.id;
  }

  let query = supabaseAdmin
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

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data.map((product) => {
    let imageUrl: string | null = null;

    if (product.image_path) {
      const { data: imageData } = supabaseAdmin.storage
        .from("product-images")
        .getPublicUrl(product.image_path);

      imageUrl = imageData.publicUrl;
    }

    return {
      ...product,
      image_url: imageUrl,
    };
  });
}
