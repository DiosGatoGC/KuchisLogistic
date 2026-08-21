import type { Category } from "@/types/catalog";

interface CategoryChipProps {
  category: Category;
  active: boolean;
  index: number;
  onSelect: (category: Category) => void;
}

export function CategoryChip({
  category,
  active,
  index,
  onSelect,
}: CategoryChipProps) {
  return (
    <button
      type="button"
      className="category-chip chip-enter"
      data-active={active}
      style={{ "--chip-index": index } as React.CSSProperties}
      onClick={() => onSelect(category)}
      aria-pressed={active}
    >
      {category.name}
    </button>
  );
}
