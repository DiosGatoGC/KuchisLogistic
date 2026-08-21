import { ProductCard } from "@/components/catalog/product-card";
import type { Category, Product } from "@/types/catalog";

interface ProductGridProps {
  category: Category;
  products: Product[];
  onAdd: (product: Product) => void;
}

export function ProductGrid({ category, products, onAdd }: ProductGridProps) {
  const availableCount = products.filter(
    (product) => product.is_available,
  ).length;

  return (
    <main id="productos" className="page-shell products-section">
      <div className="products-heading">
        <div>
          <p className="eyebrow">Nuestra carta</p>
          <h2>{category.name}</h2>
        </div>
        <span className="available-count">
          <span aria-hidden="true" />
          {availableCount} {availableCount === 1 ? "disponible" : "disponibles"}
        </span>
      </div>

      {products.length > 0 ? (
        <div className="product-grid" key={category.id}>
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              onAdd={onAdd}
            />
          ))}
        </div>
      ) : (
        <div className="empty-category">
          <p>Aún no hay productos en esta categoría.</p>
          <span>Prueba explorando otra opción de la carta.</span>
        </div>
      )}
    </main>
  );
}
