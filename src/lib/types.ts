export type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  sort_order: number;
};

export type Material = {
  id: string;
  category_id: string;
  name: string;
  image_url: string | null;
  description: string | null;
  spec: Record<string, string> | null;
  sort_order: number;
  is_active: boolean;
  catalog_pages?: string[];
};

export type MaterialVariant = {
  id: string;
  material_id: string;
  name: string;
  unit: string | null;
  sku: string | null;
  spec: Record<string, string> | null;
  sort_order: number;
  is_active: boolean;
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
  quantity: number;
  returned_quantity: number;
  lease_end_date: string | null;
};

export type CartItem = {
  material: Material;
  quantity: number;
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
