import type { UserRole } from "@/types/auth";

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imagePath: string | null;
  isAvailable: boolean;
  preparationStation: string;
  allowsAdditions: boolean;
}

export type ServiceSessionOrderStatus =
  | "OPEN"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "CANCELLED";

export type OrderItemStatus =
  | "PENDING"
  | "PREPARING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderAddition {
  productId: string;
  additionName: string;
  unitPrice: number;
  quantityPerItem: number;
}

export interface OrderItem {
  id: string;
  lineNumber: number;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes: string | null;
  preparationStation: string;
  status: OrderItemStatus;
  currentServiceSessionId: string;
  createdAt: string;
  updatedAt: string;
  preparingAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelledFromStatus: OrderItemStatus | null;
  cancellationReason: string | null;
  additions: OrderAddition[];
}

export interface Order {
  id: string;
  sequenceNumber: number;
  notes: string | null;
  sentAt: string;
  session: { id: string };
  servicePoint: { id: string; name: string };
  createdBy: { id: string; fullName: string; role: UserRole };
  items: OrderItem[];
}

export interface SessionOrdersResult {
  session: {
    id: string;
    status: ServiceSessionOrderStatus;
    servicePoint: { id: string; name: string };
  };
  orders: Order[];
}

export interface CatalogCategoriesResult {
  categories: CatalogCategory[];
}

export interface CatalogProductsResult {
  products: CatalogProduct[];
}

export interface CreateOrderResult {
  order: Order;
}

export interface CreateOrderAdditionInput {
  productId: string;
  quantityPerItem: number;
}

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  notes?: string;
  additions: CreateOrderAdditionInput[];
}

export interface CreateOrderInput {
  notes?: string;
  items: CreateOrderItemInput[];
}

export interface DraftAddition {
  productId: string;
  name: string;
  unitPrice: number;
  quantityPerItem: number;
  isAvailable: boolean;
}

export interface DraftLine {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  additions: DraftAddition[];
  invalidReason?: string;
}

export interface DraftOrder {
  notes: string;
  lines: DraftLine[];
}

export interface PersistedDraftLine {
  id: string;
  productId: string;
  quantity: number;
  notes?: string;
  additions: Array<{ productId: string; quantityPerItem: number }>;
}

export interface PersistedDraftOrder {
  version: 1;
  notes: string;
  lines: PersistedDraftLine[];
}

