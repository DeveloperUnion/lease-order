import type { PriceUnit } from "@/lib/pricing";

export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export type Material = {
  id: string;
  category_id: string;
  name: string;
  image_url: string | null;
  description: string | null;
  spec: Record<string, string> | null;
  daily_price: number | null;
  monthly_price: number | null;
  sort_order: number;
  is_active: boolean;
  catalog_pages?: string[];
  spec_groups?: SpecGroup[];
  // null = 在庫未設定。0 = 明示的に在庫切れ。
  stock_quantity?: number | null;
};

export type SpecOption = {
  id: string;
  spec_group_id: string;
  label: string;
  sort_order: number;
  // null = 在庫未設定。0 = 明示的に在庫切れ。
  stock_quantity?: number | null;
};

// 派生計算した在庫サマリ（管理画面の表示 / 発注モーダルでの残数表示に使う）。
// stock / available が null の場合は「未設定」を意味し、UI 側でハイフン等で表現する。
export type SpecOptionStock = {
  spec_option_id: string;
  group_id: string;
  stock: number | null;
  in_use: number;
  available: number | null;
};

export type MaterialStockSummary =
  | {
      kind: "spec_options";
      options: SpecOptionStock[];
    }
  | {
      kind: "material";
      stock: number | null;
      in_use: number;
      available: number | null;
    };

export type SpecGroup = {
  id: string;
  material_id: string;
  name: string;
  sort_order: number;
  options: SpecOption[];
};

export type SpecSelectionLabel = {
  spec_group_id: string;
  group_name: string;
  spec_option_id: string;
  option_label: string;
};

export type Office = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  lat: number | null;
  lng: number | null;
  sort_order: number;
  is_active: boolean;
};

export type DeliveryMethod = "delivery" | "pickup";

export type Order = {
  id: string;
  order_number: string;
  customer_id: string | null;
  site_name: string | null;
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  pickup_office_id: string | null;
  status: "pending" | "approved" | "rejected" | "renting" | "completed" | "cancelled";
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  material_id: string;
  material_name: string;
  spec_selections: SpecSelectionLabel[];
  quantity: number;
  returned_quantity: number;
  lease_end_date: string | null;
  // 発注時スナップショット（価格未設定だった行は null）
  price_unit: PriceUnit | null;
  unit_price: number | null;
  billed_units: number | null;
  amount: number | null;
};

export type CartItem = {
  cartLineId: string;
  material: Material;
  quantity: number;
  selections: SpecSelectionLabel[];
};

export type Customer = {
  id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  phone: string | null;
  default_address: string | null;
  contact_email: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export type LeaseExtension = {
  id: string;
  order_item_id: string;
  previous_end_date: string;
  new_end_date: string;
  reason: string | null;
  requested_by_customer_id: string | null;
  requested_at: string;
};
