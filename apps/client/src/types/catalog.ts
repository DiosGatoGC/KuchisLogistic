export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_path: string | null;
  image_url: string | null;
  is_available: boolean;
}

export interface ApiResponse<T> {
  status: string;
  count: number;
  data: T;
}