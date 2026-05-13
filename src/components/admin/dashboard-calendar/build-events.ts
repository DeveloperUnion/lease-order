import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { CalendarOrderRow } from "@/lib/admin-data";
import type { CalendarEvent, CalendarRange, DayBucket } from "./types";

function inRange(dateISO: string, range: CalendarRange): boolean {
  return dateISO >= range.from && dateISO <= range.to;
}

export function buildDayBuckets(
  orders: CalendarOrderRow[],
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
    if (o.lease_start_date && inRange(o.lease_start_date, range)) {
      const overdue =
        o.status === "approved" && o.lease_start_date < todayISO;
      pushEvent(map, o.lease_start_date, {
        kind: "shipment",
        order_id: o.id,
        order_number: o.order_number,
        company_name: o.company_name,
        site_name: o.site_name,
        status: o.status,
        date: o.lease_start_date,
        overdue,
      });
    }
    if (o.lease_end_date && inRange(o.lease_end_date, range)) {
      pushEvent(map, o.lease_end_date, {
        kind: "return",
        order_id: o.id,
        order_number: o.order_number,
        company_name: o.company_name,
        site_name: o.site_name,
        status: o.status,
        date: o.lease_end_date,
        overdue: false,
      });
    }
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
