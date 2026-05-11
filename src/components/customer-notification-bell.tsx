"use client";

import NotificationBell from "./notification-bell";
import {
  markAllCustomerNotificationsRead,
  markCustomerNotificationsRead,
} from "@/app/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/display";

export default function CustomerNotificationBell({
  unreadCount,
  recent,
  className,
}: {
  unreadCount: number;
  recent: NotificationRow[];
  className?: string;
}) {
  return (
    <NotificationBell
      unreadCount={unreadCount}
      recent={recent}
      audience="customer"
      markRead={markCustomerNotificationsRead}
      markAllRead={markAllCustomerNotificationsRead}
      className={className}
    />
  );
}
