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
  spec_groups?: SpecGroup[];
  variants?: MaterialVariantWithOptions[];
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

export type SpecSelectionType = "single" | "multi";

export type SpecOption = {
  id: string;
  spec_group_id: string;
  label: string;
  short_code: string | null;
  sort_order: number;
  is_active: boolean;
};

export type SpecGroup = {
  id: string;
  material_id: string;
  name: string;
  description: string | null;
  selection_type: SpecSelectionType;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  options: SpecOption[];
};

export type VariantOptionRef = {
  spec_group_id: string;
  spec_option_id: string;
};

export type MaterialVariantWithOptions = MaterialVariant & {
  options: VariantOptionRef[];
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
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  returned_quantity: number;
  lease_end_date: string | null;
};

export type CartItem = {
  cartLineId: string;
  material: Material;
  quantity: number;
  variantId?: string;
  variantName?: string;
  selections?: SpecSelectionLabel[];
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
