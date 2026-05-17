"use client";

import { use } from "react";
import CustomerNav from "./customer-nav";
import CustomerNotificationBell from "./customer-notification-bell";
import type { CustomerHeaderData } from "@/lib/header-data";

type CustomerSummary = { id: string; company_id: string; name: string };

// Header (Server) から Promise を受け取り、Suspense 境界の内側で use() して解決する。
// 同じ promise を NavWithData と BellWithData の両方に渡しても、React 19 は同一 promise を
// dedupe するので fetch は 1 回だけ。
export function CustomerNavWithData({
  customer,
  promise,
}: {
  customer: CustomerSummary;
  promise: Promise<CustomerHeaderData>;
}) {
  const { overdueCount, chatUnreadCount } = use(promise);
  return (
    <CustomerNav
      customer={customer}
      overdueCount={overdueCount}
      chatUnreadCount={chatUnreadCount}
    />
  );
}

export function CustomerNotificationBellWithData({
  promise,
}: {
  promise: Promise<CustomerHeaderData>;
}) {
  const { unreadCount, recent } = use(promise);
  return <CustomerNotificationBell unreadCount={unreadCount} recent={recent} />;
}
