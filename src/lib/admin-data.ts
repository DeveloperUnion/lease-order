import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import { getTenantId } from "./tenant";
import type {
  Category,
  DeliveryMethod,
  Material,
  MaterialVariant,
  Office,
} from "./types";

export type AdminCategoryRow = Category & { material_count: number };

type AdminMaterialRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  spec: Record<string, string> | null;
  sort_order: number;
  is_active: boolean;
  material_images:
    | {
        sort_order: number;
        is_primary: boolean;
        images: { url: string } | null;
      }[]
    | null;
};

export const listCategoriesForAdmin = cache(
  async (): Promise<AdminCategoryRow[]> => {
    const tenantId = await getTenantId();
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, image_url, sort_order, materials(id)")
      .eq("tenant_id", tenantId)
      .order("sort_order");
    if (error) throw error;

    type Row = Category & { materials: { id: string }[] | null };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      image_url: row.image_url,
      sort_order: row.sort_order,
      material_count: row.materials?.length ?? 0,
    }));
  }
);

export const listMaterialsForAdmin = cache(async (): Promise<Material[]> => {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("materials")
    .select(
      "id, category_id, name, description, spec, sort_order, is_active, material_images(sort_order, is_primary, images(url))"
    )
    .eq("tenant_id", tenantId)
    .order("sort_order");
  if (error) throw error;

  return ((data ?? []) as unknown as AdminMaterialRow[]).map((row) => {
    const imgs = (row.material_images ?? [])
      .filter((mi) => mi.images?.url)
      .sort((a, b) => a.sort_order - b.sort_order);
    const primary = imgs.find((i) => i.is_primary) ?? imgs[0];
    return {
      id: row.id,
      category_id: row.category_id,
      name: row.name,
      image_url: primary?.images?.url ?? null,
      description: row.description,
      spec: row.spec,
      sort_order: row.sort_order,
      is_active: row.is_active,
      catalog_pages: imgs.map((i) => i.images!.url),
    };
  });
});

export type MaterialImageRow = {
  image_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
  is_primary: boolean;
};

export type MaterialDetail = Material & {
  variants: MaterialVariant[];
  images: MaterialImageRow[];
};

type MaterialDetailRaw = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  spec: Record<string, string> | null;
  sort_order: number;
  is_active: boolean;
  material_variants: MaterialVariant[] | null;
  material_images:
    | {
        image_id: string;
        sort_order: number;
        is_primary: boolean;
        images: { url: string; caption: string | null } | null;
      }[]
    | null;
};

export async function getMaterialDetail(
  id: string
): Promise<MaterialDetail | null> {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("materials")
    .select(
      "id, category_id, name, description, spec, sort_order, is_active, material_variants(id, material_id, name, unit, sku, spec, sort_order, is_active), material_images(image_id, sort_order, is_primary, images(url, caption))"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const raw = data as unknown as MaterialDetailRaw;
  const images: MaterialImageRow[] = (raw.material_images ?? [])
    .filter((mi) => mi.images?.url)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((mi) => ({
      image_id: mi.image_id,
      url: mi.images!.url,
      caption: mi.images!.caption,
      sort_order: mi.sort_order,
      is_primary: mi.is_primary,
    }));
  const primary = images.find((i) => i.is_primary) ?? images[0];
  const variants = (raw.material_variants ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    id: raw.id,
    category_id: raw.category_id,
    name: raw.name,
    description: raw.description,
    spec: raw.spec,
    sort_order: raw.sort_order,
    is_active: raw.is_active,
    image_url: primary?.url ?? null,
    catalog_pages: images.map((i) => i.url),
    variants,
    images,
  };
}

export type AdminOfficeRow = Office & { in_use_count: number };

export const listOfficesForAdmin = cache(
  async (): Promise<AdminOfficeRow[]> => {
    const tenantId = await getTenantId();
    const { data, error } = await supabaseAdmin
      .from("offices")
      .select(
        "id, name, area, address, phone, fax, sort_order, is_active, orders(id)"
      )
      .eq("tenant_id", tenantId)
      .order("sort_order");
    if (error) throw error;

    type Row = Office & { orders: { id: string }[] | null };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      id: row.id,
      name: row.name,
      area: row.area,
      address: row.address,
      phone: row.phone,
      fax: row.fax,
      sort_order: row.sort_order,
      is_active: row.is_active,
      in_use_count: row.orders?.length ?? 0,
    }));
  }
);

export type { OrderStatus } from "./order-status";
import type { OrderStatus } from "./order-status";

export type OrderListRow = {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  status: OrderStatus;
  created_at: string;
  item_count: number;
  total_quantity: number;
};

export type OrderItemRow = {
  id: string;
  material_id: string;
  variant_id: string | null;
  material_name: string;
  variant_name: string | null;
  quantity: number;
  approved_quantity: number | null;
};

export type OrderPickupOffice = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  phone: string | null;
};

export type OrderDetail = {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  pickup_office: OrderPickupOffice | null;
  status: OrderStatus;
  approved_at: string | null;
  approved_by: string | null;
  reject_reason: string | null;
  rejected_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  created_at: string;
  items: OrderItemRow[];
};

type OrdersListRaw = {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  status: OrderStatus;
  created_at: string;
  order_items: { quantity: number }[] | null;
};

export async function listOrders(
  filterStatus?: OrderStatus
): Promise<OrderListRow[]> {
  const tenantId = await getTenantId();
  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, company_name, contact_name, status, created_at, order_items(quantity)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filterStatus) {
    query = query.eq("status", filterStatus);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as OrdersListRaw[]).map((row) => ({
    id: row.id,
    order_number: row.order_number,
    company_name: row.company_name,
    contact_name: row.contact_name,
    status: row.status,
    created_at: row.created_at,
    item_count: row.order_items?.length ?? 0,
    total_quantity: (row.order_items ?? []).reduce(
      (sum, it) => sum + (it.quantity ?? 0),
      0
    ),
  }));
}

type OrderDetailRaw = {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  pickup_office_id: string | null;
  status: OrderStatus;
  approved_at: string | null;
  approved_by: string | null;
  reject_reason: string | null;
  rejected_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  created_at: string;
  order_items: (OrderItemRow & { created_at: string })[] | null;
  offices:
    | { id: string; name: string; area: string | null; address: string | null; phone: string | null }
    | null;
};

export const getOrder = cache(async (id: string): Promise<OrderDetail | null> => {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, company_name, contact_name, phone, email, note, delivery_method, delivery_address, lease_start_date, lease_end_date, pickup_office_id, status, approved_at, approved_by, reject_reason, rejected_at, shipped_at, completed_at, created_at, order_items(id, material_id, variant_id, material_name, variant_name, quantity, approved_quantity, created_at), offices:pickup_office_id(id, name, area, address, phone)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const raw = data as unknown as OrderDetailRaw;
  const items = (raw.order_items ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((it) => ({
      id: it.id,
      material_id: it.material_id,
      variant_id: it.variant_id,
      material_name: it.material_name,
      variant_name: it.variant_name,
      quantity: it.quantity,
      approved_quantity: it.approved_quantity,
    }));

  return {
    id: raw.id,
    order_number: raw.order_number,
    company_name: raw.company_name,
    contact_name: raw.contact_name,
    phone: raw.phone,
    email: raw.email,
    note: raw.note,
    delivery_method: raw.delivery_method,
    delivery_address: raw.delivery_address,
    lease_start_date: raw.lease_start_date,
    lease_end_date: raw.lease_end_date,
    pickup_office: raw.offices ?? null,
    status: raw.status,
    approved_at: raw.approved_at,
    approved_by: raw.approved_by,
    reject_reason: raw.reject_reason,
    rejected_at: raw.rejected_at,
    shipped_at: raw.shipped_at,
    completed_at: raw.completed_at,
    created_at: raw.created_at,
    items,
  };
});

export type AdminCustomerRow = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  default_address: string | null;
  contact_email: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export async function listCustomersForAdmin(): Promise<AdminCustomerRow[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, company_id, name, phone, default_address, contact_email, is_active, must_change_password, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminCustomerRow[];
}

export async function getCustomerForAdmin(id: string): Promise<AdminCustomerRow | null> {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, company_id, name, phone, default_address, contact_email, is_active, must_change_password, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as AdminCustomerRow) ?? null;
}

export async function countCustomers(): Promise<number> {
  const tenantId = await getTenantId();
  const { count, error } = await supabaseAdmin
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function countPendingOrders(): Promise<number> {
  const tenantId = await getTenantId();
  const { count, error } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export async function countActiveMaterials(): Promise<number> {
  const tenantId = await getTenantId();
  const { count, error } = await supabaseAdmin
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function countOrdersInMonth(status?: OrderStatus): Promise<number> {
  const tenantId = await getTenantId();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let query = supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export type RecentOrderRow = {
  id: string;
  order_number: string;
  company_name: string;
  status: OrderStatus;
  created_at: string;
};

export async function listRecentOrders(limit: number): Promise<RecentOrderRow[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, company_name, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as RecentOrderRow[];
}

export { statusLabels } from "./order-status";

export type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, email, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

// ============================================================
// Return / extension pending requests
// ============================================================

type PendingRequestBase = {
  order_id: string;
  order_number: string;
  site_name: string | null;
  company_name: string;
  contact_name: string;
  order_item_id: string;
  material_name: string;
  reason: string | null;
  requested_at: string;
};

export type PendingReturnRequest = PendingRequestBase & {
  type: "return";
  id: string;
  requested_quantity_delta: number;
};

export type PendingExtensionRequest = PendingRequestBase & {
  type: "extension";
  id: string;
  previous_end_date: string;
  new_end_date: string;
};

export type PendingRequest = PendingReturnRequest | PendingExtensionRequest;

type ItemInfo = {
  order_id: string;
  order_number: string;
  site_name: string | null;
  company_name: string;
  contact_name: string;
  order_item_id: string;
  material_name: string;
};

async function buildItemInfoMap(tenantId: string): Promise<Map<string, ItemInfo>> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, site_name, company_name, contact_name, order_items(id, material_name)"
    )
    .eq("tenant_id", tenantId);
  if (error) throw error;
  const map = new Map<string, ItemInfo>();
  for (const o of (data ?? []) as {
    id: string;
    order_number: string;
    site_name: string | null;
    company_name: string;
    contact_name: string;
    order_items: { id: string; material_name: string }[] | null;
  }[]) {
    for (const it of o.order_items ?? []) {
      map.set(it.id, {
        order_id: o.id,
        order_number: o.order_number,
        site_name: o.site_name,
        company_name: o.company_name,
        contact_name: o.contact_name,
        order_item_id: it.id,
        material_name: it.material_name,
      });
    }
  }
  return map;
}

export async function listPendingRequests(): Promise<PendingRequest[]> {
  const tenantId = await getTenantId();
  const itemInfoMap = await buildItemInfoMap(tenantId);
  const itemIds = Array.from(itemInfoMap.keys());
  if (itemIds.length === 0) return [];

  const [{ data: returns, error: retErr }, { data: extensions, error: extErr }] =
    await Promise.all([
      supabaseAdmin
        .from("return_requests")
        .select("id, order_item_id, requested_quantity_delta, reason, requested_at")
        .in("order_item_id", itemIds)
        .eq("status", "pending"),
      supabaseAdmin
        .from("lease_extensions")
        .select("id, order_item_id, previous_end_date, new_end_date, reason, requested_at")
        .in("order_item_id", itemIds)
        .eq("status", "pending"),
    ]);
  if (retErr) throw retErr;
  if (extErr) throw extErr;

  const items: PendingRequest[] = [];
  for (const r of (returns ?? []) as {
    id: string;
    order_item_id: string;
    requested_quantity_delta: number;
    reason: string | null;
    requested_at: string;
  }[]) {
    const info = itemInfoMap.get(r.order_item_id);
    if (!info) continue;
    items.push({
      type: "return",
      id: r.id,
      requested_quantity_delta: r.requested_quantity_delta,
      reason: r.reason,
      requested_at: r.requested_at,
      ...info,
    });
  }
  for (const e of (extensions ?? []) as {
    id: string;
    order_item_id: string;
    previous_end_date: string;
    new_end_date: string;
    reason: string | null;
    requested_at: string;
  }[]) {
    const info = itemInfoMap.get(e.order_item_id);
    if (!info) continue;
    items.push({
      type: "extension",
      id: e.id,
      previous_end_date: e.previous_end_date,
      new_end_date: e.new_end_date,
      reason: e.reason,
      requested_at: e.requested_at,
      ...info,
    });
  }
  items.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  return items;
}

export async function countPendingRequests(): Promise<number> {
  const tenantId = await getTenantId();
  const itemInfoMap = await buildItemInfoMap(tenantId);
  const itemIds = Array.from(itemInfoMap.keys());
  if (itemIds.length === 0) return 0;

  const [{ count: rc, error: re }, { count: ec, error: ee }] = await Promise.all([
    supabaseAdmin
      .from("return_requests")
      .select("id", { count: "exact", head: true })
      .in("order_item_id", itemIds)
      .eq("status", "pending"),
    supabaseAdmin
      .from("lease_extensions")
      .select("id", { count: "exact", head: true })
      .in("order_item_id", itemIds)
      .eq("status", "pending"),
  ]);
  if (re) throw re;
  if (ee) throw ee;
  return (rc ?? 0) + (ec ?? 0);
}
