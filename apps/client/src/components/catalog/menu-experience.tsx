"use client";

import { useCallback, useMemo, useState } from "react";

import { CategoryNav } from "@/components/catalog/category-nav";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Hero } from "@/components/layout/hero";
import { FloatingSimulation } from "@/components/simulation/floating-simulation";
import { SimulationDrawer } from "@/components/simulation/simulation-drawer";
import { useSimulation } from "@/hooks/use-simulation";
import {
  ADDITIONS_CATEGORY_SLUG,
  CUSTOMIZABLE_CATEGORY_SLUGS,
  getPublicCategories,
} from "@/lib/catalog";
import type { Category, Product } from "@/types/catalog";

interface MenuExperienceProps {
  categories: Category[];
  products: Product[];
}

export function MenuExperience({
  categories,
  products,
}: MenuExperienceProps) {
  const publicCategories = useMemo(
    () => getPublicCategories(categories),
    [categories],
  );
  const additionalOptions = useMemo(() => {
    const additionalCategory = categories.find(
      (category) => category.slug === ADDITIONS_CATEGORY_SLUG,
    );

    if (!additionalCategory) return [];

    return products
      .filter((product) => product.category_id === additionalCategory.id)
      .map(({ id, name, price, is_available }) => ({
        id,
        name,
        price: Number(price),
        is_available,
      }));
  }, [categories, products]);
  const customizableCategoryIds = useMemo(
    () =>
      categories
        .filter((category) =>
          CUSTOMIZABLE_CATEGORY_SLUGS.has(category.slug),
        )
        .map((category) => category.id),
    [categories],
  );
  const [activeCategoryId, setActiveCategoryId] = useState(
    publicCategories[0]?.id ?? "",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const simulation = useSimulation();

  const activeCategory =
    publicCategories.find((category) => category.id === activeCategoryId) ??
    publicCategories[0];

  const visibleProducts = useMemo(
    () =>
      activeCategory
        ? products.filter(
            (product) => product.category_id === activeCategory.id,
          )
        : [],
    [activeCategory, products],
  );

  const handleCategorySelect = (category: Category) => {
    setActiveCategoryId(category.id);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    document.getElementById("productos")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  if (!activeCategory) {
    return (
      <div className="catalog-state">
        <p>No encontramos categorías públicas para mostrar.</p>
      </div>
    );
  }

  return (
    <div id="inicio" className="site-root">
      <Header />
      <Hero />
      <CategoryNav
        categories={publicCategories}
        activeCategory={activeCategory}
        onSelect={handleCategorySelect}
      />
      <ProductGrid
        category={activeCategory}
        products={visibleProducts}
        onAdd={simulation.addProduct}
      />
      <Footer />

      <FloatingSimulation
        count={simulation.itemCount}
        total={simulation.total}
        onOpen={() => setDrawerOpen(true)}
      />
      <SimulationDrawer
        open={drawerOpen}
        items={simulation.items}
        additionalOptions={additionalOptions}
        customizableCategoryIds={customizableCategoryIds}
        total={simulation.total}
        onClose={closeDrawer}
        onIncrement={simulation.increment}
        onDecrement={simulation.decrement}
        onRemove={simulation.remove}
        onCustomize={simulation.customizeUnit}
        onClear={simulation.clear}
      />
    </div>
  );
}
