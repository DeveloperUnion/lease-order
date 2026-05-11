import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import type { DeliveryMethod } from "./types";

export type PendingExtension = {
  id: string;
  new_end_date: string;
  reason: string | null;
  requested_at: string;
};

export type RentalItemRow = {
  id: string;
  material_id: string;
  material_name: string;
  quantity: number;
  returned_quantity: number;
  pending_return_delta: number;
  remaining: number;            // quantity - returned_quantity (acknowledged のみ)
  effective_remaining: number;  // quantity - returned_quantity - pending_return_delta
  lease_end_date: string | null;
  is_overdue: boolean;
  pending_extension: PendingExtension | null;
};

export type RentalOrder = {
  id: string;
  order_number: string;
  site_name: string | null;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  pickup_office: { id: string; name: string; area: string | null; address: string | null; phone: string | null } | null;
  status: string;
  lease_start_date: string | null;
  lease_end_date: string | null;
  created_at: string;
  items: RentalItemRow[];
  // 承認済み延長履歴のみ。pending は各 item.pending_extension に格納。
  extensions: Record<string, { previous_end_date: string; new_end_date: string; reason: string | null; requested_at: string }[]>;
};

export type RentalSite = {
  site_name: string;
  active_order_count: number;
  overdue_item_count: number;
  soonest_end_date: string | null;
  orders: { id: string; order_number: string; lease_end_date: string | null; overdue_item_count: number; active_item_count: number }[];
};

export type OverdueItemEntry = {
  order_id: string;
  order_number: string;
  site_name: string | null;
  item: RentalItemRow;
};

export type RentalsListResult = {
  overdueItems: OverdueItemEntry[];
  sites: RentalSite[];
  hasAny: boolean;
};

export type RentalItemFlat = {
  order_id: string;
  order_number: string;
  site_key: string;
  site_name: string | null;
  item_id: string;
  material_id: string;
  material_name: string;
  quantity: number;
  returned_quantity: number;
  remaining: number;
  lease_end_date: string | null;
  is_overdue: boolean;
  days_to_due: number | null;
};

export type RentalSiteTab = {
  key: string;
  label: string;
  item_count: number;
  overdue_count: number;
};

export type RentalsFlatResult = {
  items: RentalItemFlat[];
  sites: RentalSiteTab[];
  totalOverdueCount: number;
  hasAny: boolean;
};

const UNSET_SITE_KEY = "__unset__";
const UNSET_SITE_LABEL = "現場未設定";

function todayIsoLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function isItemOverdue(leaseEndDate: string | null, today: string): boolean {
  if (!leaseEndDate) return false;
  return leaseEndDate < today;
}

type RentalsListRaw = {
  id: string;
  order_number: string;
  site_name: string | null;
  status: string;
  lease_end_date: string | null;
  order_items:
    | {
        id: string;
        material_id: string;
        material_name: string;
        quantity: number;
        returned_quantity: number;
        lease_end_date: string | null;
      }[]
    | null;
};

export async function listRentalsByCustomer(customerId: string, tenantId: string): Promise<RentalsListResult> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, site_name, status, lease_end_date, order_items(id, material_id, material_name, quantity, returned_quantity, lease_end_date)"
    )
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .not("status", "in", "(cancelled,completed)")
    .order("lease_end_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const today = todayIsoLocal();
  const sitesMap = new Map<string, RentalSite>();
  const overdueItems: OverdueItemEntry[] = [];

  for (const raw of (data ?? []) as RentalsListRaw[]) {
    const items = (raw.order_items ?? [])
      .map((it) => {
        const remaining = it.quantity - it.returned_quantity;
        return { row: it, remaining, overdue: isItemOverdue(it.lease_end_date, today) };
      })
      .filter((x) => x.remaining > 0);

    if (items.length === 0) continue;

    const overdueCount = items.filter((x) => x.overdue).length;
    const earliestEnd = items
      .map((x) => x.row.lease_end_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;

    const siteKey = raw.site_name ?? "(現場未設定)";
    const display = raw.site_name ?? "(現場未設定)";
    let bucket = sitesMap.get(siteKey);
    if (!bucket) {
      bucket = {
        site_name: display,
        active_order_count: 0,
        overdue_item_count: 0,
        soonest_end_date: null,
        orders: [],
      };
      sitesMap.set(siteKey, bucket);
    }
    bucket.active_order_count += 1;
    bucket.overdue_item_count += overdueCount;
    if (earliestEnd && (!bucket.soonest_end_date || earliestEnd < bucket.soonest_end_date)) {
      bucket.soonest_end_date = earliestEnd;
    }
    bucket.orders.push({
      id: raw.id,
      order_number: raw.order_number,
      lease_end_date: earliestEnd,
      overdue_item_count: overdueCount,
      active_item_count: items.length,
    });

    for (const x of items) {
      if (x.overdue) {
        overdueItems.push({
          order_id: raw.id,
          order_number: raw.order_number,
          site_name: raw.site_name,
          item: {
            id: x.row.id,
            material_id: x.row.material_id,
            material_name: x.row.material_name,
            quantity: x.row.quantity,
            returned_quantity: x.row.returned_quantity,
            pending_return_delta: 0,
            remaining: x.remaining,
            effective_remaining: x.remaining,
            lease_end_date: x.row.lease_end_date,
            is_overdue: true,
            pending_extension: null,
          },
        });
      }
    }
  }

  const sites = Array.from(sitesMap.values()).sort((a, b) => {
    if (a.overdue_item_count !== b.overdue_item_count) return b.overdue_item_count - a.overdue_item_count;
    if (a.soonest_end_date && b.soonest_end_date) return a.soonest_end_date.localeCompare(b.soonest_end_date);
    return a.site_name.localeCompare(b.site_name);
  });

  return { overdueItems, sites, hasAny: sites.length > 0 };
}

function diffDays(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export async function listRentalItemsByCustomer(customerId: string, tenantId: string): Promise<RentalsFlatResult> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, site_name, status, order_items(id, material_id, material_name, quantity, returned_quantity, lease_end_date)"
    )
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .not("status", "in", "(cancelled,completed)");
  if (error) throw error;

  const today = todayIsoLocal();
  const items: RentalItemFlat[] = [];
  const siteMap = new Map<string, RentalSiteTab>();

  for (const raw of (data ?? []) as RentalsListRaw[]) {
    const siteKey = raw.site_name ? raw.site_name : UNSET_SITE_KEY;
    const siteLabel = raw.site_name ?? UNSET_SITE_LABEL;
    for (const it of raw.order_items ?? []) {
      const remaining = it.quantity - it.returned_quantity;
      if (remaining <= 0) continue;
      const overdue = isItemOverdue(it.lease_end_date, today);
      items.push({
        order_id: raw.id,
        order_number: raw.order_number,
        site_key: siteKey,
        site_name: raw.site_name,
        item_id: it.id,
        material_id: it.material_id,
        material_name: it.material_name,
        quantity: it.quantity,
        returned_quantity: it.returned_quantity,
        remaining,
        lease_end_date: it.lease_end_date,
        is_overdue: overdue,
        days_to_due: it.lease_end_date ? diffDays(today, it.lease_end_date) : null,
      });

      let site = siteMap.get(siteKey);
      if (!site) {
        site = { key: siteKey, label: siteLabel, item_count: 0, overdue_count: 0 };
        siteMap.set(siteKey, site);
      }
      site.item_count += 1;
      if (overdue) site.overdue_count += 1;
    }
  }

  items.sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    if (a.lease_end_date && b.lease_end_date) {
      const cmp = a.lease_end_date.localeCompare(b.lease_end_date);
      if (cmp !== 0) return cmp;
    } else if (a.lease_end_date) {
      return -1;
    } else if (b.lease_end_date) {
      return 1;
    }
    return a.material_name.localeCompare(b.material_name);
  });

  const sites = Array.from(siteMap.values()).sort((a, b) => {
    if (a.overdue_count !== b.overdue_count) return b.overdue_count - a.overdue_count;
    if (a.key === UNSET_SITE_KEY) return 1;
    if (b.key === UNSET_SITE_KEY) return -1;
    return a.label.localeCompare(b.label);
  });

  const totalOverdueCount = items.reduce((acc, x) => acc + (x.is_overdue ? 1 : 0), 0);

  return { items, sites, totalOverdueCount, hasAny: items.length > 0 };
}

type OrderDetailRaw = {
  id: string;
  order_number: string;
  customer_id: string | null;
  site_name: string | null;
  status: string;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  pickup_office_id: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  created_at: string;
  order_items:
    | {
        id: string;
        material_id: string;
        material_name: string;
        quantity: number;
        returned_quantity: number;
        lease_end_date: string | null;
        created_at: string;
      }[]
    | null;
  offices:
    | { id: string; name: string; area: string | null; address: string | null; phone: string | null }
    | null;
};

type ExtensionRaw = {
  id: string;
  order_item_id: string;
  previous_end_date: string;
  new_end_date: string;
  reason: string | null;
  requested_at: string;
  status: "pending" | "acknowledged" | "rejected";
};

type ReturnRequestRaw = {
  order_item_id: string;
  requested_quantity_delta: number;
};

export const getRentalOrder = cache(async (orderId: string, customerId: string, tenantId: string): Promise<RentalOrder | null> => {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, customer_id, site_name, status, delivery_method, delivery_address, pickup_office_id, lease_start_date, lease_end_date, created_at, order_items(id, material_id, material_name, quantity, returned_quantity, lease_end_date, created_at), offices:pickup_office_id(id, name, area, address, phone)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as unknown as OrderDetailRaw;
  if (raw.customer_id !== customerId) return null;

  const sortedItems = (raw.order_items ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const itemIds = sortedItems.map((i) => i.id);

  const pendingReturnDelta = new Map<string, number>();
  const pendingExtensionByItem = new Map<string, PendingExtension>();
  const ackExtensions: Record<string, { previous_end_date: string; new_end_date: string; reason: string | null; requested_at: string }[]> = {};

  if (itemIds.length > 0) {
    const [{ data: extData, error: extErr }, { data: retData, error: retErr }] = await Promise.all([
      supabaseAdmin
        .from("lease_extensions")
        .select("id, order_item_id, previous_end_date, new_end_date, reason, requested_at, status")
        .in("order_item_id", itemIds)
        .order("requested_at", { ascending: false }),
      supabaseAdmin
        .from("return_requests")
        .select("order_item_id, requested_quantity_delta")
        .in("order_item_id", itemIds)
        .eq("status", "pending"),
    ]);
    if (extErr) throw extErr;
    if (retErr) throw retErr;

    for (const e of (extData ?? []) as ExtensionRaw[]) {
      if (e.status === "pending") {
        if (!pendingExtensionByItem.has(e.order_item_id)) {
          pendingExtensionByItem.set(e.order_item_id, {
            id: e.id,
            new_end_date: e.new_end_date,
            reason: e.reason,
            requested_at: e.requested_at,
          });
        }
      } else if (e.status === "acknowledged") {
        (ackExtensions[e.order_item_id] ??= []).push({
          previous_end_date: e.previous_end_date,
          new_end_date: e.new_end_date,
          reason: e.reason,
          requested_at: e.requested_at,
        });
      }
    }
    for (const r of (retData ?? []) as ReturnRequestRaw[]) {
      pendingReturnDelta.set(
        r.order_item_id,
        (pendingReturnDelta.get(r.order_item_id) ?? 0) + r.requested_quantity_delta
      );
    }
  }

  const today = todayIsoLocal();
  const items: RentalItemRow[] = sortedItems.map((it) => {
    const pendingDelta = pendingReturnDelta.get(it.id) ?? 0;
    const remaining = it.quantity - it.returned_quantity;
    const effective_remaining = remaining - pendingDelta;
    return {
      id: it.id,
      material_id: it.material_id,
      material_name: it.material_name,
      quantity: it.quantity,
      returned_quantity: it.returned_quantity,
      pending_return_delta: pendingDelta,
      remaining,
      effective_remaining,
      lease_end_date: it.lease_end_date,
      is_overdue: remaining > 0 && isItemOverdue(it.lease_end_date, today),
      pending_extension: pendingExtensionByItem.get(it.id) ?? null,
    };
  });

  return {
    id: raw.id,
    order_number: raw.order_number,
    site_name: raw.site_name,
    delivery_method: raw.delivery_method,
    delivery_address: raw.delivery_address,
    pickup_office: raw.offices ?? null,
    status: raw.status,
    lease_start_date: raw.lease_start_date,
    lease_end_date: raw.lease_end_date,
    created_at: raw.created_at,
    items,
    extensions: ackExtensions,
  };
});

export type CustomerOrderRow = {
  id: string;
  order_number: string;
  site_name: string | null;
  status: "pending" | "confirmed" | "shipped" | "completed" | "cancelled";
  lease_start_date: string | null;
  lease_end_date: string | null;
  item_count: number;
  active_item_count: number;
  overdue_item_count: number;
  created_at: string;
};

type AllOrdersRaw = {
  id: string;
  order_number: string;
  site_name: string | null;
  status: "pending" | "confirmed" | "shipped" | "completed" | "cancelled";
  lease_start_date: string | null;
  lease_end_date: string | null;
  created_at: string;
  order_items:
    | { id: string; quantity: number; returned_quantity: number; lease_end_date: string | null }[]
    | null;
};

export type OrderStatusFilter = "active" | "completed" | "cancelled" | "all";

export async function listAllOrdersByCustomer(
  customerId: string,
  tenantId: string,
  statusFilter: OrderStatusFilter = "all"
): Promise<CustomerOrderRow[]> {
  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, site_name, status, lease_start_date, lease_end_date, created_at, order_items(id, quantity, returned_quantity, lease_end_date)"
    )
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (statusFilter === "completed") {
    query = query.eq("status", "completed");
  } else if (statusFilter === "cancelled") {
    query = query.eq("status", "cancelled");
  } else if (statusFilter === "active") {
    query = query.not("status", "in", "(cancelled,completed)");
  }

  const { data, error } = await query;
  if (error) throw error;

  const today = todayIsoLocal();
  return ((data ?? []) as AllOrdersRaw[]).map((raw) => {
    const items = raw.order_items ?? [];
    const activeItems = items.filter((it) => it.quantity - it.returned_quantity > 0);
    const overdueCount = activeItems.filter((it) => isItemOverdue(it.lease_end_date, today)).length;
    return {
      id: raw.id,
      order_number: raw.order_number,
      site_name: raw.site_name,
      status: raw.status,
      lease_start_date: raw.lease_start_date,
      lease_end_date: raw.lease_end_date,
      item_count: items.length,
      active_item_count: activeItems.length,
      overdue_item_count: overdueCount,
      created_at: raw.created_at,
    };
  });
}

export async function countOverdueForCustomer(customerId: string, tenantId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("order_items(id, quantity, returned_quantity, lease_end_date)")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .not("status", "in", "(cancelled,completed)");
  if (error) throw error;
  const today = todayIsoLocal();
  let count = 0;
  for (const row of (data ?? []) as { order_items: { id: string; quantity: number; returned_quantity: number; lease_end_date: string | null }[] | null }[]) {
    for (const it of row.order_items ?? []) {
      const remaining = it.quantity - it.returned_quantity;
      if (remaining > 0 && isItemOverdue(it.lease_end_date, today)) count++;
    }
  }
  return count;
}
