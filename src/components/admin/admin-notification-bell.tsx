"use client";

import NotificationBell from "@/components/notification-bell";
import {
  markAdminNotificationsRead,
  markAllAdminNotificationsRead,
} from "@/app/admin/(panel)/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/display";

export default function AdminNotificationBell({
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
      audience="admin"
      markRead={markAdminNotificationsRead}
      markAllRead={markAllAdminNotificationsRead}
      className={className}
    />
  );
}
