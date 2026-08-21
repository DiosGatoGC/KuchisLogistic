import { CatalogUnavailable } from "@/components/catalog/catalog-unavailable";
import { MenuExperience } from "@/components/catalog/menu-experience";
import { getCategories, getProducts } from "@/lib/api";

async function loadCatalog() {
  try {
    const [categories, products] = await Promise.all([
      getCategories(),
      getProducts(),
    ]);

    return { categories, products };
  } catch {
    return null;
  }
}

export default async function Home() {
  const catalog = await loadCatalog();

  if (!catalog) return <CatalogUnavailable />;

  return (
    <MenuExperience
      categories={catalog.categories}
      products={catalog.products}
    />
  );
}
