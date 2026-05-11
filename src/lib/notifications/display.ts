import type { NotificationKind } from "./types";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  order_id: string | null;
  payload: {
    orderNumber?: string;
    companyName?: string;
    contactName?: string;
    itemSummary?: string | null;
    rejectReason?: string | null;
  };
  read_at: string | null;
  created_at: string;
};

export function labelForNotification(row: NotificationRow): string {
  const order = row.payload.orderNumber ?? "";
  const company = row.payload.companyName ?? "";
  switch (row.kind) {
    case "order_approved":
      return `ご発注を承認しました${order ? ` (${order})` : ""}`;
    case "order_rejected":
      return `ご発注を承認できませんでした${order ? ` (${order})` : ""}`;
    case "order_cancelled":
      return `ご発注を取り消しました${order ? ` (${order})` : ""}`;
    case "order_shipped":
      return `ご発注を出荷しました${order ? ` (${order})` : ""}`;
    case "admin_new_order":
      return `新規発注: ${company}${order ? ` ${order}` : ""}`;
    case "return_requested":
      return `返却申請: ${company}`;
    case "return_acknowledged":
      return `返却を受領しました${order ? ` (${order})` : ""}`;
    case "return_rejected":
      return `返却の確認が必要です${order ? ` (${order})` : ""}`;
    case "extension_requested":
      return `期限延長申請: ${company}`;
    case "extension_acknowledged":
      return `期限延長を承認しました${order ? ` (${order})` : ""}`;
    case "extension_rejected":
      return `期限延長を承認できませんでした${order ? ` (${order})` : ""}`;
  }
}

// 通知タップ時の遷移先は、種類によらず常に「その発注の詳細画面」に統一する。
// 顧客 → /rentals/[orderId]（発注詳細を返却・延長アクション込みで表示）
// 管理 → /admin/orders/[id]（返却・延長の申請状態も含めて全文脈を確認できる）
// order_id が無い通知（理論上ほぼない）は audience 別の一覧にフォールバック。
export function linkForNotification(
  row: NotificationRow,
  audience: "customer" | "admin"
): string {
  if (!row.order_id) {
    return audience === "admin" ? "/admin" : "/rentals";
  }
  return audience === "admin"
    ? `/admin/orders/${row.order_id}`
    : `/rentals/${row.order_id}`;
}
