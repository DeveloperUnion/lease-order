import "server-only";
import { countOverdueForCustomer } from "./rentals-data";
import {
  countUnreadForCustomer,
  listNotificationsForCustomer,
  type NotificationRow,
} from "./notifications-data";

export type CustomerHeaderData = {
  overdueCount: number;
  unreadCount: number;
  recent: NotificationRow[];
};

// Header / CustomerNav 用の集約クエリ。Header.tsx (Server) で await せずに
// Promise のまま受け、HeaderClient 配下の <Suspense> + use() で個別に解決させる。
export async function getCustomerHeaderData(
  customerId: string,
  tenantId: string
): Promise<CustomerHeaderData> {
  const [overdueCount, unreadCount, recent] = await Promise.all([
    countOverdueForCustomer(customerId, tenantId),
    countUnreadForCustomer(customerId, tenantId),
    listNotificationsForCustomer(customerId, tenantId, 10),
  ]);
  return { overdueCount, unreadCount, recent };
}
