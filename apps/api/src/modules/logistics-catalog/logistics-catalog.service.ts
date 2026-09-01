import { AppError } from "../../errors/app-error";
import type { AuthenticatedUser } from "../auth/auth.types";
import {
  logisticsCatalogRepository,
  type LogisticsCatalogRepository,
} from "./logistics-catalog.repository";

export class LogisticsCatalogService {
  constructor(private readonly catalog: LogisticsCatalogRepository) {}

  async listCategories() {
    return (await this.catalog.listCategories()).map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      sortOrder: category.sort_order,
    }));
  }

  async listProducts(category?: string) {
    return (await this.catalog.listProducts(category)).map((product) => ({
      id: product.id,
      categoryId: product.category_id,
      name: product.name,
      description: product.description,
      price: product.price,
      imagePath: product.image_path,
      isAvailable: product.is_available,
      preparationStation: product.preparation_station,
      allowsAdditions: product.allows_additions,
    }));
  }

  async setAvailability(
    productId: string,
    isAvailable: boolean,
    actor: AuthenticatedUser
  ) {
    const result = await this.catalog.setAvailability(productId, isAvailable, actor);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new AppError(500, "CATALOG_RPC_RESPONSE_INVALID", "La disponibilidad cambió, pero la respuesta no es válida.");
    }
    return { productId, isAvailable };
  }
}

export const logisticsCatalogService = new LogisticsCatalogService(
  logisticsCatalogRepository
);
