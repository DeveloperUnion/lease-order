import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";
import type { DeliveryMethod } from "./types";
import type { PriceUnit } from "./pricing";

export type PendingExtension = {
  id: string;
  new_end_date: string;
  reason: string | null;
  requested_at: string;
};

export type ScheduledReturn = {
  id: string;
  requested_quantity_delta: number;
  scheduled_date: string;
  transport_method: "pickup" | "dropoff";
  dropoff_office_name: string | null;
  material_name: string;
};

export type RejectedReturn = {
  id: string;
  material_name: string;
  requested_quantity_delta: number;
  reason: string | null;
  decided_at: string | null;
  status: "rejected" | "cancelled";
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
  price_unit: PriceUnit | null;
  unit_price: number | null;
  amount: number | null;
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
  scheduled_returns: ScheduledReturn[];
  rejected_returns: RejectedReturn[];
};

export type RentalSite = {
  site_name: string;
  active_order_count: number;
  overdue_item_count: number;
  soonest_end_date: string | null;
  orders: {
    id: string;
    order_number: string;
    lease_end_date: string | null;
    overdue_item_count: number;
    active_item_count: number;
    next_return: { scheduled_date: string; transport_method: "pickup" | "dropoff" } | null;
  }[];
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
    .eq("status", "renting")
    .order("lease_end_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  // 各発注の「直近の scheduled 返却」を取得するため、order_items 経由で
  // 一発取得して order_id ごとに最早の scheduled_date を抜き出す。
  const rawOrders = (data ?? []) as RentalsListRaw[];
  const allItemIds = rawOrders.flatMap((o) => (o.order_items ?? []).map((it) => it.id));
  const nextReturnByOrder = new Map<
    string,
    { scheduled_date: string; transport_method: "pickup" | "dropoff" }
  >();
  if (allItemIds.length > 0) {
    const { data: scheduled, error: schedErr } = await supabaseAdmin
      .from("return_requests")
      .select(
        "scheduled_date, transport_method, order_items!inner(id, order_id)"
      )
      .in("order_item_id", allItemIds)
      .eq("status", "scheduled")
      .order("scheduled_date", { ascending: true });
    if (schedErr) throw schedErr;
    type SchedRow = {
      scheduled_date: string;
      transport_method: "pickup" | "dropoff";
      order_items: { id: string; order_id: string } | null;
    };
    for (const row of (scheduled ?? []) as unknown as SchedRow[]) {
      const orderId = row.order_items?.order_id;
      if (!orderId || !row.scheduled_date || !row.transport_method) continue;
      if (!nextReturnByOrder.has(orderId)) {
        nextReturnByOrder.set(orderId, {
          scheduled_date: row.scheduled_date,
          transport_method: row.transport_method,
        });
      }
    }
  }

  const today = todayIsoLocal();
  const sitesMap = new Map<string, RentalSite>();
  const overdueItems: OverdueItemEntry[] = [];

  for (const raw of rawOrders) {
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
      next_return: nextReturnByOrder.get(raw.id) ?? null,
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
            price_unit: null,
            unit_price: null,
            amount: null,
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
        price_unit: PriceUnit | null;
        unit_price: number | null;
        amount: number | null;
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

type ScheduledReturnRaw = {
  id: string;
  order_item_id: string;
  requested_quantity_delta: number;
  scheduled_date: string;
  transport_method: "pickup" | "dropoff";
  dropoff_office_id: string | null;
  offices: { id: string; name: string } | null;
  order_items: { id: string; material_name: string } | null;
};

type RejectedReturnRaw = {
  id: string;
  requested_quantity_delta: number;
  reject_reason: string | null;
  cancel_reason: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  status: "rejected" | "cancelled";
  order_items: { material_name: string } | null;
};

export const getRentalOrder = cache(async (orderId: string, customerId: string, tenantId: string): Promise<RentalOrder | null> => {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, customer_id, site_name, status, delivery_method, delivery_address, pickup_office_id, lease_start_date, lease_end_date, created_at, order_items(id, material_id, material_name, quantity, returned_quantity, lease_end_date, created_at, price_unit, unit_price, amount), offices:pickup_office_id(id, name, area, address, phone)"
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

  const scheduledReturns: ScheduledReturn[] = [];
  const rejectedReturns: RejectedReturn[] = [];
  if (itemIds.length > 0) {
    const [
      { data: extData, error: extErr },
      { data: retData, error: retErr },
      { data: scheduledData, error: scheduledErr },
      { data: rejectedData, error: rejectedErr },
    ] = await Promise.all([
      supabaseAdmin
        .from("lease_extensions")
        .select("id, order_item_id, previous_end_date, new_end_date, reason, requested_at, status")
        .in("order_item_id", itemIds)
        .order("requested_at", { ascending: false }),
      // pending (予定確定待ち) と scheduled (受領待ち) は両方とも「申請中」扱いで
      // effective_remaining から差し引く。
      supabaseAdmin
        .from("return_requests")
        .select("order_item_id, requested_quantity_delta")
        .in("order_item_id", itemIds)
        .in("status", ["pending", "scheduled"]),
      supabaseAdmin
        .from("return_requests")
        .select(
          "id, order_item_id, requested_quantity_delta, scheduled_date, transport_method, dropoff_office_id, offices:dropoff_office_id(id, name), order_items!inner(id, material_name)"
        )
        .in("order_item_id", itemIds)
        .eq("status", "scheduled")
        .order("scheduled_date", { ascending: true }),
      supabaseAdmin
        .from("return_requests")
        .select(
          "id, requested_quantity_delta, reject_reason, cancel_reason, rejected_at, cancelled_at, status, order_items!inner(material_name)"
        )
        .in("order_item_id", itemIds)
        .in("status", ["rejected", "cancelled"])
        .order("rejected_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);
    if (extErr) throw extErr;
    if (retErr) throw retErr;
    if (scheduledErr) throw scheduledErr;
    if (rejectedErr) throw rejectedErr;
    for (const r of (rejectedData ?? []) as unknown as RejectedReturnRaw[]) {
      if (!r.order_items) continue;
      const status: "rejected" | "cancelled" =
        r.status === "cancelled" ? "cancelled" : "rejected";
      rejectedReturns.push({
        id: r.id,
        material_name: r.order_items.material_name,
        requested_quantity_delta: r.requested_quantity_delta,
        reason: status === "cancelled" ? r.cancel_reason : r.reject_reason,
        decided_at: status === "cancelled" ? r.cancelled_at : r.rejected_at,
        status,
      });
    }
    for (const s of (scheduledData ?? []) as unknown as ScheduledReturnRaw[]) {
      if (!s.scheduled_date || !s.transport_method || !s.order_items) continue;
      scheduledReturns.push({
        id: s.id,
        requested_quantity_delta: s.requested_quantity_delta,
        scheduled_date: s.scheduled_date,
        transport_method: s.transport_method,
        dropoff_office_name: s.offices?.name ?? null,
        material_name: s.order_items.material_name,
      });
    }

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
      price_unit: it.price_unit,
      unit_price: it.unit_price,
      amount: it.amount,
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
    scheduled_returns: scheduledReturns,
    rejected_returns: rejectedReturns,
  };
});

export type CustomerOrderRow = {
  id: string;
  order_number: string;
  site_name: string | null;
  status: "pending" | "approved" | "rejected" | "renting" | "completed" | "cancelled";
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
  status: "pending" | "approved" | "rejected" | "renting" | "completed" | "cancelled";
  lease_start_date: string | null;
  lease_end_date: string | null;
  created_at: string;
  order_items:
    | { id: string; quantity: number; returned_quantity: number; lease_end_date: string | null }[]
    | null;
};

export type OrderStatusFilter = "active" | "completed" | "cancelled" | "all";

export type ListOrdersOptions = {
  /** デフォルト 50。ページ内に表示する最大件数。 */
  limit?: number;
  /** 直前ページ末尾の created_at。これより古い行を取得する（cursor pagination）。 */
  cursorCreatedAt?: string | null;
};

export type ListOrdersResult = {
  rows: CustomerOrderRow[];
  /** さらに古い発注が残っていれば次の cursor をセット。 */
  nextCursor: string | null;
};

export async function listAllOrdersByCustomer(
  customerId: string,
  tenantId: string,
  statusFilter: OrderStatusFilter = "all",
  opts: ListOrdersOptions = {}
): Promise<ListOrdersResult> {
  const limit = opts.limit ?? 50;
  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, site_name, status, lease_start_date, lease_end_date, created_at, order_items(id, quantity, returned_quantity, lease_end_date)"
    )
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    // limit + 1 件取得して「次がまだあるか」を判定する。
    .limit(limit + 1);

  if (opts.cursorCreatedAt) {
    query = query.lt("created_at", opts.cursorCreatedAt);
  }

  if (statusFilter === "completed") {
    query = query.eq("status", "completed");
  } else if (statusFilter === "cancelled") {
    query = query.in("status", ["cancelled", "rejected"]);
  } else if (statusFilter === "active") {
    query = query.not("status", "in", "(cancelled,completed,rejected)");
  }

  const { data, error } = await query;
  if (error) throw error;

  const raws = (data ?? []) as AllOrdersRaw[];
  const hasMore = raws.length > limit;
  const sliced = hasMore ? raws.slice(0, limit) : raws;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.created_at ?? null : null;

  const today = todayIsoLocal();
  const rows = sliced.map((raw) => {
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

  return { rows, nextCursor };
}

export async function countOverdueForCustomer(customerId: string, tenantId: string): Promise<number> {
  // overdue 判定は (quantity - returned_quantity > 0) という算術述語が必要で
  // PostgREST のフィルタでは表現できないため RPC (migration 0015) に委譲する。
  // 以前はテナントの全 orders + order_items をメモリロードしていた。
  const { data, error } = await supabaseAdmin.rpc("count_overdue_for_customer", {
    p_customer: customerId,
    p_tenant: tenantId,
  });
  if (error) throw error;
  return (data as number | null) ?? 0;
}
