import { CategoryChip } from "@/components/catalog/category-chip";
import type { Category } from "@/types/catalog";

interface CategoryNavProps {
  categories: Category[];
  activeCategory: Category;
  onSelect: (category: Category) => void;
}

export function CategoryNav({
  categories,
  activeCategory,
  onSelect,
}: CategoryNavProps) {
  return (
    <nav className="category-nav" aria-label="Categorías de la carta">
      <div className="page-shell category-nav__scroll">
        {categories.map((category, index) => (
          <CategoryChip
            key={category.id}
            category={category}
            active={activeCategory.id === category.id}
            index={index}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  );
}
