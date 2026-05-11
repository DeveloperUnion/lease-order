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
    case "order_received":
      return `ご発注を受け付けました${order ? ` (${order})` : ""}`;
    case "order_approved":
      return `ご発注を承認しました${order ? ` (${order})` : ""}`;
    case "order_rejected":
      return `ご発注を承認できませんでした${order ? ` (${order})` : ""}`;
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

export function linkForNotification(
  row: NotificationRow,
  audience: "customer" | "admin"
): string {
  if (audience === "admin") {
    if (row.kind === "return_requested" || row.kind === "extension_requested") {
      return "/admin/requests";
    }
    return row.order_id ? `/admin/orders/${row.order_id}` : "/admin";
  }
  return row.order_id ? `/rentals/${row.order_id}` : "/rentals";
}
