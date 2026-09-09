import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogAvailabilityErrorMessage } from "./catalog-availability-error-model.ts";
import {
  availabilityPayload,
  catalogAvailabilityPermissions,
  filterCatalogProducts,
  normalizeCatalog,
  reconcileProductAvailability,
  runWithProductLock,
} from "./catalog-availability-model.ts";
import { executeAvailabilityAttempt } from "./catalog-availability-mutation.ts";
import type { CatalogCategory, CatalogProduct } from "../ordering/ordering-types.ts";

const categories: CatalogCategory[] = [
  { id: "cat-2", name: "Bebidas", slug: "bebidas", sortOrder: 2 },
  { id: "cat-1", name: "Platos", slug: "platos", sortOrder: 1 },
];

const products: CatalogProduct[] = [
  {
    id: "product-1",
    categoryId: "cat-1",
    name: "Ramen",
    description: null,
    price: 25,
    imagePath: null,
    isAvailable: true,
    preparationStation: "KITCHEN",
    allowsAdditions: true,
  },
  {
    id: "product-2",
    categoryId: "cat-2",
    name: "Limonada",
    description: null,
    price: 8,
    imagePath: null,
    isAvailable: false,
    preparationStation: "DRINKS",
    allowsAdditions: false,
  },
];

describe("catalog availability model", () => {
  it("normalizes category metadata and preserves product availability", () => {
    const model = normalizeCatalog(categories, products);
    assert.deepEqual(model.categories.map((category) => category.slug), ["platos", "bebidas"]);
    assert.equal(model.products[0]?.categoryName, "Platos");
    assert.equal(model.products[0]?.isAvailable, true);
    assert.equal(model.products[1]?.isAvailable, false);
  });

  it("filters products by category and supports all", () => {
    const model = normalizeCatalog(categories, products);
    assert.equal(filterCatalogProducts(model.products, "all").length, 2);
    assert.deepEqual(
      filterCatalogProducts(model.products, "bebidas").map((product) => product.name),
      ["Limonada"],
    );
  });

  it("keeps view and mutation capabilities independent", () => {
    assert.deepEqual(catalogAvailabilityPermissions(["tables.view"]), {
      canView: true,
      canMutate: false,
    });
    assert.deepEqual(catalogAvailabilityPermissions(["tables.view", "catalog.availability"]), {
      canView: true,
      canMutate: true,
    });
  });

  it("builds the exact availability PATCH payload", () => {
    assert.deepEqual(availabilityPayload(false), { isAvailable: false });
    assert.deepEqual(availabilityPayload(true), { isAvailable: true });
  });

  it("prevents a duplicate mutation for the same product only", async () => {
    const locks = new Set<string>();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const first = runWithProductLock(locks, "product-1", async () => {
      calls.push("first");
      await pending;
    });
    const duplicate = await runWithProductLock(locks, "product-1", async () => {
      calls.push("duplicate");
    });
    const other = await runWithProductLock(locks, "product-2", async () => {
      calls.push("other");
      return "ok";
    });
    assert.equal(duplicate, undefined);
    assert.equal(other, "ok");
    assert.deepEqual(calls, ["first", "other"]);
    release();
    await first;
  });

  it("reconciles applied, unchanged and missing availability", () => {
    assert.equal(reconcileProductAvailability(products, "product-1", true, false), "unchanged");
    const changed = products.map((product) => product.id === "product-1"
      ? { ...product, isAvailable: false }
      : product);
    assert.equal(reconcileProductAvailability(changed, "product-1", true, false), "applied");
    assert.equal(reconcileProductAvailability(products, "missing", true, false), "missing");
  });

  it("refetches after a confirmed mutation", async () => {
    let mutationCalls = 0;
    const result = await executeAvailabilityAttempt({
      mutate: async () => {
        mutationCalls += 1;
        return { product: { productId: "product-1", isAvailable: false } };
      },
      refetch: async () => ({
        products: products.map((product) => product.id === "product-1"
          ? { ...product, isAvailable: false }
          : product),
      }),
      classifyFailure: () => "other",
    });
    assert.equal(result.kind, "confirmed");
    assert.equal(mutationCalls, 1);
  });

  it("reconciles an ambiguous mutation without retrying PATCH", async () => {
    let mutationCalls = 0;
    const result = await executeAvailabilityAttempt({
      mutate: async () => {
        mutationCalls += 1;
        throw new Error("network");
      },
      refetch: async () => ({ products }),
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "ambiguous");
    assert.equal(mutationCalls, 1);
  });

  it("reports unresolved ambiguity when authoritative refetch fails", async () => {
    const result = await executeAvailabilityAttempt({
      mutate: async () => { throw new Error("network"); },
      refetch: async () => { throw new Error("offline"); },
      classifyFailure: () => "ambiguous",
    });
    assert.equal(result.kind, "unresolved");
  });

  it("uses safe Spanish error fallbacks", () => {
    assert.match(catalogAvailabilityErrorMessage({ kind: "forbidden" }), /permiso/i);
    assert.match(catalogAvailabilityErrorMessage({ kind: "network" }), /conectar/i);
  });
});
