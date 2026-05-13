import type { OrderStatus } from "@/lib/order-status";

export type CalendarView = "month" | "week";

export type EventKind = "shipment" | "return";

export type CalendarEvent = {
  kind: EventKind;
  order_id: string;
  order_number: string;
  company_name: string;
  site_name: string | null;
  status: OrderStatus;
  /** ISO yyyy-mm-dd, the date the event lands on */
  date: string;
  /** True when this is an overdue shipment (past date, still approved). */
  overdue: boolean;
};

export type DayBucket = {
  /** ISO yyyy-mm-dd */
  date: string;
  events: CalendarEvent[];
};

export type CalendarRange = {
  /** ISO date of the first visible cell (inclusive) — for month view this is the first day of the leading week */
  from: string;
  /** ISO date of the last visible cell (inclusive) */
  to: string;
  /** ISO date used as the anchor for "current month" / "current week" — i.e. the first day of the requested month/week */
  anchor: string;
};
