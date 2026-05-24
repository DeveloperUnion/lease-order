import { cache } from "react";
import { getSupabaseTenant } from "./supabase-tenant";
import { getTenantId } from "./tenant";
import type {
  Category,
  DeliveryMethod,
  Material,
  MaterialStockSummary,
  Office,
  SpecGroup,
  SpecOption,
  SpecOptionStock,
  SpecSelectionLabel,
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
    const supabase = await getSupabaseTenant();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, sort_order, materials(id)")
      .eq("tenant_id", tenantId)
      .order("sort_order");
    if (error) throw error;

    type Row = Category & { materials: { id: string }[] | null };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      sort_order: row.sort_order,
      material_count: row.materials?.length ?? 0,
    }));
  }
);

export const listMaterialsForAdmin = cache(async (): Promise<Material[]> => {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
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
  spec_groups: SpecGroup[];
  images: MaterialImageRow[];
};

type SpecOptionRaw = {
  id: string;
  spec_group_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  stock_quantity: number | null;
};

type SpecGroupRaw = {
  id: string;
  material_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  spec_options: SpecOptionRaw[] | null;
};

type MaterialDetailRaw = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  spec: Record<string, string> | null;
  sort_order: number;
  is_active: boolean;
  stock_quantity: number | null;
  spec_groups: SpecGroupRaw[] | null;
  material_images:
    | {
        image_id: string;
        sort_order: number;
        is_primary: boolean;
        images: { url: string; caption: string | null } | null;
      }[]
    | null;
};

function mapSpecOption(row: SpecOptionRaw): SpecOption {
  return {
    id: row.id,
    spec_group_id: row.spec_group_id,
    label: row.label,
    sort_order: row.sort_order,
    stock_quantity: row.stock_quantity,
  };
}

// admin 画面では削除済み（is_active=false）の項目も含めない
function mapSpecGroup(row: SpecGroupRaw): SpecGroup {
  return {
    id: row.id,
    material_id: row.material_id,
    name: row.name,
    sort_order: row.sort_order,
    options: (row.spec_options ?? [])
      .filter((o) => o.is_active)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapSpecOption),
  };
}

export async function getMaterialDetail(
  id: string
): Promise<MaterialDetail | null> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("materials")
    .select(
      `id, category_id, name, description, spec, sort_order, is_active, stock_quantity,
       spec_groups(id, material_id, name, sort_order, is_active,
         spec_options(id, spec_group_id, label, sort_order, is_active, stock_quantity)),
       material_images(image_id, sort_order, is_primary, images(url, caption))`
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
  const spec_groups = (raw.spec_groups ?? [])
    .filter((g) => g.is_active)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapSpecGroup);

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
    stock_quantity: raw.stock_quantity,
    spec_groups,
    images,
  };
}

// ============================================================
// 在庫サマリ（派生計算）
//
// stock_quantity はマスタの保有数。in_use は order_items から派生計算する。
// 「貸出中」= status not in ('rejected','cancelled') な order に紐づく
// order_items の (quantity - returned_quantity - lost_quantity) の合計。
//
// 仕様グループがある材料は spec_option 単位で集計（order_item_spec_options 経由）。
// 仕様グループが無い材料は materials 直下で集計。
// ============================================================

const ACTIVE_ORDER_STATUSES = ["pending", "approved", "renting", "completed"] as const;

type StockUsageRow = {
  spec_option_id: string;
  order_items: {
    quantity: number;
    returned_quantity: number;
    lost_quantity: number | null;
    orders: { status: string } | null;
  } | null;
};

type MaterialUsageRow = {
  id: string;
  quantity: number;
  returned_quantity: number;
  lost_quantity: number | null;
  orders: { status: string } | null;
};

export async function getMaterialStockSummary(
  materialId: string
): Promise<MaterialStockSummary> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();

  const { data: matRow, error: matErr } = await supabase
    .from("materials")
    .select(
      `id, stock_quantity,
       spec_groups(id, is_active,
         spec_options(id, spec_group_id, stock_quantity, is_active))`
    )
    .eq("tenant_id", tenantId)
    .eq("id", materialId)
    .maybeSingle();
  if (matErr) throw matErr;
  if (!matRow) throw new Error("対象の資材が見つかりません");

  type Row = {
    stock_quantity: number | null;
    spec_groups:
      | {
          id: string;
          is_active: boolean;
          spec_options:
            | {
                id: string;
                spec_group_id: string;
                stock_quantity: number | null;
                is_active: boolean;
              }[]
            | null;
        }[]
      | null;
  };
  const r = matRow as unknown as Row;

  const activeOptions = (r.spec_groups ?? [])
    .filter((g) => g.is_active)
    .flatMap((g) =>
      (g.spec_options ?? []).filter((o) => o.is_active).map((o) => ({
        id: o.id,
        group_id: o.spec_group_id,
        stock: o.stock_quantity,
      }))
    );

  if (activeOptions.length === 0) {
    // 仕様グループ無し: order_items を直接集計
    const stock = r.stock_quantity;
    const { data, error } = await supabase
      .from("order_items")
      .select("id, quantity, returned_quantity, lost_quantity, orders!inner(status)")
      .eq("tenant_id", tenantId)
      .eq("material_id", materialId)
      .in("orders.status", ACTIVE_ORDER_STATUSES as unknown as string[]);
    if (error) throw error;
    let inUse = 0;
    for (const row of (data ?? []) as unknown as MaterialUsageRow[]) {
      const remaining =
        row.quantity - row.returned_quantity - (row.lost_quantity ?? 0);
      if (remaining > 0) inUse += remaining;
    }
    return {
      kind: "material",
      stock: stock ?? null,
      in_use: inUse,
      available: stock == null ? null : Math.max(0, stock - inUse),
    };
  }

  const optionIds = activeOptions.map((o) => o.id);
  const { data: usage, error: usageErr } = await supabase
    .from("order_item_spec_options")
    .select(
      "spec_option_id, order_items!inner(quantity, returned_quantity, lost_quantity, orders!inner(status))"
    )
    .eq("tenant_id", tenantId)
    .in("spec_option_id", optionIds)
    .in("order_items.orders.status", ACTIVE_ORDER_STATUSES as unknown as string[]);
  if (usageErr) throw usageErr;

  const inUseByOption = new Map<string, number>();
  for (const row of (usage ?? []) as unknown as StockUsageRow[]) {
    const oi = row.order_items;
    if (!oi) continue;
    const remaining =
      oi.quantity - oi.returned_quantity - (oi.lost_quantity ?? 0);
    if (remaining <= 0) continue;
    inUseByOption.set(
      row.spec_option_id,
      (inUseByOption.get(row.spec_option_id) ?? 0) + remaining
    );
  }

  const options: SpecOptionStock[] = activeOptions.map((o) => {
    const inUse = inUseByOption.get(o.id) ?? 0;
    return {
      spec_option_id: o.id,
      group_id: o.group_id,
      stock: o.stock ?? null,
      in_use: inUse,
      available: o.stock == null ? null : Math.max(0, o.stock - inUse),
    };
  });

  return { kind: "spec_options", options };
}

export type AdminOfficeRow = Office & { in_use_count: number };

export const listOfficesForAdmin = cache(
  async (): Promise<AdminOfficeRow[]> => {
    const tenantId = await getTenantId();
    const supabase = await getSupabaseTenant();
    const { data, error } = await supabase
      .from("offices")
      .select(
        "id, name, area, address, phone, fax, lat, lng, sort_order, is_active, orders(id)"
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
      lat: row.lat,
      lng: row.lng,
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
  material_name: string;
  spec_selections: SpecSelectionLabel[];
  quantity: number;
  approved_quantity: number | null;
};

export type OrderPickupOffice = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
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
  delivery_lat: number | null;
  delivery_lng: number | null;
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
  const supabase = await getSupabaseTenant();
  let query = supabase
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
  delivery_lat: number | null;
  delivery_lng: number | null;
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
  order_items:
    | (Omit<OrderItemRow, "spec_selections"> & {
        created_at: string;
        order_item_spec_options:
          | {
              spec_group_id: string;
              spec_option_id: string;
              group_name_snapshot: string;
              option_label_snapshot: string;
            }[]
          | null;
      })[]
    | null;
  offices:
    | {
        id: string;
        name: string;
        area: string | null;
        address: string | null;
        phone: string | null;
        lat: number | null;
        lng: number | null;
      }
    | null;
};

export const getOrder = cache(async (id: string): Promise<OrderDetail | null> => {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, company_name, contact_name, phone, email, note,
       delivery_method, delivery_address, delivery_lat, delivery_lng,
       lease_start_date, lease_end_date, pickup_office_id, status,
       approved_at, approved_by, reject_reason, rejected_at, shipped_at,
       completed_at, created_at,
       order_items(id, material_id, material_name, quantity, approved_quantity, created_at,
         order_item_spec_options(spec_group_id, spec_option_id, group_name_snapshot, option_label_snapshot)),
       offices:pickup_office_id(id, name, area, address, phone, lat, lng)`
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const raw = data as unknown as OrderDetailRaw;
  const items: OrderItemRow[] = (raw.order_items ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((it) => ({
      id: it.id,
      material_id: it.material_id,
      material_name: it.material_name,
      quantity: it.quantity,
      approved_quantity: it.approved_quantity,
      spec_selections: (it.order_item_spec_options ?? []).map((s) => ({
        spec_group_id: s.spec_group_id,
        spec_option_id: s.spec_option_id,
        group_name: s.group_name_snapshot,
        option_label: s.option_label_snapshot,
      })),
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
    delivery_lat: raw.delivery_lat,
    delivery_lng: raw.delivery_lng,
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
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("customers")
    .select("id, company_id, name, phone, default_address, contact_email, is_active, must_change_password, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminCustomerRow[];
}

export async function getCustomerForAdmin(id: string): Promise<AdminCustomerRow | null> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
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
  const supabase = await getSupabaseTenant();
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function countPendingOrders(): Promise<number> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}

export type CalendarOrderRow = {
  id: string;
  order_number: string;
  company_name: string;
  site_name: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
};

export async function listOrdersInRange(
  fromISO: string,
  toISO: string,
): Promise<CalendarOrderRow[]> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, company_name, site_name, lease_start_date, lease_end_date, status, delivery_method",
    )
    .eq("tenant_id", tenantId)
    .in("status", ["approved", "renting"])
    .or(
      `and(lease_start_date.gte.${fromISO},lease_start_date.lte.${toISO}),and(lease_end_date.gte.${fromISO},lease_end_date.lte.${toISO})`,
    )
    .order("lease_start_date", { ascending: true });
  if (error) throw error;

  return (data ?? []) as unknown as CalendarOrderRow[];
}

export type CalendarScheduledReturnRow = {
  id: string;
  order_id: string;
  order_number: string;
  company_name: string;
  site_name: string | null;
  scheduled_date: string;
  transport_method: "pickup" | "dropoff";
  order_status: OrderStatus;
};

export async function listScheduledReturnsInRange(
  fromISO: string,
  toISO: string,
): Promise<CalendarScheduledReturnRow[]> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("return_requests")
    .select(
      "id, scheduled_date, transport_method, order_items!inner(id, orders!inner(id, order_number, company_name, site_name, status))"
    )
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .gte("scheduled_date", fromISO)
    .lte("scheduled_date", toISO)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;

  type Row = {
    id: string;
    scheduled_date: string;
    transport_method: "pickup" | "dropoff";
    order_items: {
      id: string;
      orders: {
        id: string;
        order_number: string;
        company_name: string;
        site_name: string | null;
        status: OrderStatus;
      } | null;
    } | null;
  };

  // 同じ order に対して複数の scheduled が同日にある場合は 1 件にまとめる。
  const seen = new Set<string>();
  const out: CalendarScheduledReturnRow[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const order = r.order_items?.orders;
    if (!order) continue;
    const dedupeKey = `${order.id}_${r.scheduled_date}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      id: r.id,
      order_id: order.id,
      order_number: order.order_number,
      company_name: order.company_name,
      site_name: order.site_name,
      scheduled_date: r.scheduled_date,
      transport_method: r.transport_method,
      order_status: order.status,
    });
  }
  return out;
}

export { statusLabels } from "./order-status";

export type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
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
  transport_method: "pickup" | "dropoff" | null;
  desired_date: string | null;
  dropoff_office_id: string | null;
  dropoff_office_name: string | null;
};

export type ScheduledReturnRequest = PendingRequestBase & {
  type: "return";
  id: string;
  requested_quantity_delta: number;
  transport_method: "pickup" | "dropoff";
  scheduled_date: string;
  dropoff_office_id: string | null;
  dropoff_office_name: string | null;
};

export type PendingExtensionRequest = PendingRequestBase & {
  type: "extension";
  id: string;
  previous_end_date: string;
  new_end_date: string;
};

export type PendingRequest = PendingReturnRequest | PendingExtensionRequest;

// PostgREST のネスト selectで return_requests / lease_extensions から
// 直接 order_items → orders までを 1 クエリで JOIN する。
// 以前は orders 全件と order_items 全件をアプリ側で先にメモリロードしてから
// 紐付けていたが、pending な申請の件数は通常少数なので、ここを起点に逆引きする方が
// 圧倒的に安い (テナントの注文数に依存しない)。
type RequestRowBase = {
  id: string;
  order_item_id: string;
  reason: string | null;
  requested_at: string;
  order_items: {
    id: string;
    material_name: string;
    orders: {
      id: string;
      order_number: string;
      site_name: string | null;
      company_name: string;
      contact_name: string;
    } | null;
  } | null;
};
type ReturnRequestRow = RequestRowBase & {
  requested_quantity_delta: number;
  transport_method: "pickup" | "dropoff" | null;
  desired_date: string | null;
  dropoff_office_id: string | null;
  scheduled_date: string | null;
  offices: { id: string; name: string } | null;
};
type ExtensionRequestRow = RequestRowBase & {
  previous_end_date: string;
  new_end_date: string;
};

const PENDING_REQUEST_SELECT =
  "id, order_item_id, reason, requested_at, order_items!inner(id, material_name, orders!inner(id, order_number, site_name, company_name, contact_name))";

const RETURN_TRANSPORT_FIELDS =
  "transport_method, desired_date, dropoff_office_id, scheduled_date, offices:dropoff_office_id(id, name)";

export async function listPendingRequests(): Promise<PendingRequest[]> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const [returnsRes, extensionsRes] = await Promise.all([
    supabase
      .from("return_requests")
      .select(`${PENDING_REQUEST_SELECT}, requested_quantity_delta, ${RETURN_TRANSPORT_FIELDS}`)
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
    supabase
      .from("lease_extensions")
      .select(`${PENDING_REQUEST_SELECT}, previous_end_date, new_end_date`)
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
  ]);
  if (returnsRes.error) throw returnsRes.error;
  if (extensionsRes.error) throw extensionsRes.error;

  const items: PendingRequest[] = [];
  for (const r of (returnsRes.data ?? []) as unknown as ReturnRequestRow[]) {
    const oi = r.order_items;
    const order = oi?.orders;
    if (!oi || !order) continue;
    items.push({
      type: "return",
      id: r.id,
      requested_quantity_delta: r.requested_quantity_delta,
      reason: r.reason,
      requested_at: r.requested_at,
      order_id: order.id,
      order_number: order.order_number,
      site_name: order.site_name,
      company_name: order.company_name,
      contact_name: order.contact_name,
      order_item_id: oi.id,
      material_name: oi.material_name,
      transport_method: r.transport_method,
      desired_date: r.desired_date,
      dropoff_office_id: r.dropoff_office_id,
      dropoff_office_name: r.offices?.name ?? null,
    });
  }
  for (const e of (extensionsRes.data ?? []) as unknown as ExtensionRequestRow[]) {
    const oi = e.order_items;
    const order = oi?.orders;
    if (!oi || !order) continue;
    items.push({
      type: "extension",
      id: e.id,
      previous_end_date: e.previous_end_date,
      new_end_date: e.new_end_date,
      reason: e.reason,
      requested_at: e.requested_at,
      order_id: order.id,
      order_number: order.order_number,
      site_name: order.site_name,
      company_name: order.company_name,
      contact_name: order.contact_name,
      order_item_id: oi.id,
      material_name: oi.material_name,
    });
  }
  items.sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  return items;
}

// 受領待ちの返却（status='scheduled'）を一覧で取得。
// pending と分けて表示することで、検品待ちの量がひと目で分かる。
export async function listScheduledReturns(): Promise<ScheduledReturnRequest[]> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data, error } = await supabase
    .from("return_requests")
    .select(`${PENDING_REQUEST_SELECT}, requested_quantity_delta, ${RETURN_TRANSPORT_FIELDS}`)
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .order("scheduled_date", { ascending: true });
  if (error) throw error;

  const items: ScheduledReturnRequest[] = [];
  for (const r of (data ?? []) as unknown as ReturnRequestRow[]) {
    const oi = r.order_items;
    const order = oi?.orders;
    if (!oi || !order) continue;
    if (!r.transport_method || !r.scheduled_date) continue;
    items.push({
      type: "return",
      id: r.id,
      requested_quantity_delta: r.requested_quantity_delta,
      reason: r.reason,
      requested_at: r.requested_at,
      order_id: order.id,
      order_number: order.order_number,
      site_name: order.site_name,
      company_name: order.company_name,
      contact_name: order.contact_name,
      order_item_id: oi.id,
      material_name: oi.material_name,
      transport_method: r.transport_method,
      scheduled_date: r.scheduled_date,
      dropoff_office_id: r.dropoff_office_id,
      dropoff_office_name: r.offices?.name ?? null,
    });
  }
  return items;
}

// 申請は発注単位で一括承認するため、バッジは「申請が来ている発注数」をカウントする。
// pending な申請数 × order_item の JOIN だけ取り、order_id で dedupe する。
export async function countPendingRequests(): Promise<number> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  // 返却は pending（予定確定待ち）と scheduled（受領待ち）の両方が「要対応」。
  // 延長は pending のみ。
  const [returnsRes, extensionsRes] = await Promise.all([
    supabase
      .from("return_requests")
      .select("status, order_items!inner(order_id)")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "scheduled"]),
    supabase
      .from("lease_extensions")
      .select("order_items!inner(order_id)")
      .eq("tenant_id", tenantId)
      .eq("status", "pending"),
  ]);
  if (returnsRes.error) throw returnsRes.error;
  if (extensionsRes.error) throw extensionsRes.error;

  const orderIds = new Set<string>();
  for (const row of (returnsRes.data ?? []) as unknown as Array<{
    order_items: { order_id: string } | null;
  }>) {
    if (row.order_items?.order_id) orderIds.add(row.order_items.order_id);
  }
  for (const row of (extensionsRes.data ?? []) as unknown as Array<{
    order_items: { order_id: string } | null;
  }>) {
    if (row.order_items?.order_id) orderIds.add(row.order_items.order_id);
  }
  return orderIds.size;
}
