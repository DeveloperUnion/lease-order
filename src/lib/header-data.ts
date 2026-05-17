import "server-only";
import { unstable_cache } from "next/cache";
import { countOverdueForCustomer } from "./rentals-data";
import {
  countUnreadForCustomer,
  listNotificationsForCustomer,
  type NotificationRow,
} from "./notifications-data";
import { getCustomerChatBadge } from "./chat/data";

export type CustomerHeaderData = {
  overdueCount: number;
  unreadCount: number;
  recent: NotificationRow[];
  chatUnreadCount: number;
};

// Header / CustomerNav 用の集約クエリ。Header.tsx (Server) で await せずに
// Promise のまま受け、HeaderClient 配下の <Suspense> + use() で個別に解決させる。
//
// per-customer key で 10 秒キャッシュ。
//   - chat 未読: useLiveChatUnread が realtime で追従するので初期値の数秒遅れは無害
//   - 通知: NotificationBell が realtime で INSERT を被せるので同様
//   - overdue: 1 日に 1 回しか境界が変わらないので 10 秒の stale は許容範囲
// router.refresh の連発で同じクエリが繰り返される現象を吸収するのが目的。
export const getCustomerHeaderData = unstable_cache(
  async (
    customerId: string,
    tenantId: string
  ): Promise<CustomerHeaderData> => {
    const [overdueCount, unreadCount, recent, chatUnreadCount] = await Promise.all([
      countOverdueForCustomer(customerId, tenantId),
      countUnreadForCustomer(customerId, tenantId),
      listNotificationsForCustomer(customerId, tenantId, 10),
      getCustomerChatBadge(customerId, tenantId),
    ]);
    return { overdueCount, unreadCount, recent, chatUnreadCount };
  },
  ["customer-header-data"],
  { revalidate: 10 }
);
