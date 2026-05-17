import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { CalendarOrderRow, CalendarScheduledReturnRow } from "@/lib/admin-data";
import type { CalendarEvent, CalendarRange, DayBucket } from "./types";

function inRange(dateISO: string, range: CalendarRange): boolean {
  return dateISO >= range.from && dateISO <= range.to;
}

export function buildDayBuckets(
  orders: CalendarOrderRow[],
  scheduledReturns: CalendarScheduledReturnRow[],
  range: CalendarRange,
  todayISO: string,
): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  for (const d of eachDayOfInterval({
    start: parseISO(range.from),
    end: parseISO(range.to),
  })) {
    const iso = format(d, "yyyy-MM-dd");
    map.set(iso, { date: iso, events: [] });
  }

  for (const o of orders) {
    // 出荷イベントは approved のみ（renting は既に出荷済なので不要）
    if (
      o.status === "approved" &&
      o.lease_start_date &&
      inRange(o.lease_start_date, range)
    ) {
      const overdue = o.lease_start_date < todayISO;
      pushEvent(map, o.lease_start_date, {
        kind: "shipment",
        order_id: o.id,
        order_number: o.order_number,
        company_name: o.company_name,
        site_name: o.site_name,
        status: o.status,
        date: o.lease_start_date,
        overdue,
        delivery_method: o.delivery_method,
      });
    }
    // lease_end_date 由来の event は「遅延（返却未済）」のみ表示する。
    // 確定したスケジュールは return_requests 由来の return-scheduled で別途出る。
    if (
      o.status === "renting" &&
      o.lease_end_date &&
      o.lease_end_date < todayISO &&
      inRange(o.lease_end_date, range)
    ) {
      pushEvent(map, o.lease_end_date, {
        kind: "return",
        order_id: o.id,
        order_number: o.order_number,
        company_name: o.company_name,
        site_name: o.site_name,
        status: o.status,
        date: o.lease_end_date,
        overdue: true,
      });
    }
  }

  for (const s of scheduledReturns) {
    if (!inRange(s.scheduled_date, range)) continue;
    pushEvent(map, s.scheduled_date, {
      kind: "return-scheduled",
      order_id: s.order_id,
      order_number: s.order_number,
      company_name: s.company_name,
      site_name: s.site_name,
      status: s.order_status,
      date: s.scheduled_date,
      overdue: false,
      transport_method: s.transport_method,
    });
  }

  return map;
}

function pushEvent(
  map: Map<string, DayBucket>,
  date: string,
  ev: CalendarEvent,
) {
  const b = map.get(date);
  if (!b) return;
  b.events.push(ev);
}
