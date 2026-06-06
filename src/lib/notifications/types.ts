export type NotificationKind =
  | "order_approved"
  | "order_rejected"
  | "order_cancelled"
  | "order_shipped"
  | "admin_new_order"
  | "return_requested"
  | "return_scheduled"
  | "return_completed"
  | "return_rejected"
  | "return_cancelled"
  | "extension_requested"
  | "extension_acknowledged"
  | "extension_rejected";

export type NotificationContext = {
  orderNumber: string;
  companyName: string;
  contactName: string;
  itemSummary?: string;
  rejectReason?: string;
  adminUrl?: string;
  // 返却フロー拡張: 予定確定・受領完了の通知で使う
  scheduledDate?: string;       // yyyy-mm-dd
  transportMethod?: "pickup" | "dropoff";
  dropoffOfficeName?: string;
  damageNotes?: string;
};

export type NotificationTarget =
  | {
      kind: "customer";
      customerId: string | null;
      orderId: string | null;
      address: string;
    }
  | {
      kind: "admin";
      adminUserId: string;
      orderId: string | null;
      address: string;
    };

// 個別宛先型チャンネル（email / in-app）。受信者ごとに 1 通配信する。
export interface Channel {
  readonly name: "email" | "in-app";
  supports(kind: NotificationKind): boolean;
  send(
    target: NotificationTarget,
    kind: NotificationKind,
    ctx: NotificationContext,
    tenantId: string
  ): Promise<void>;
}

// 連携先の識別子。notification_channels.channel と一致する。
export type TeamChannelName = "slack" | "chatwork" | "line_works";

// 共有チャンネル型（Slack 等）。テナント単位で 1 回だけ投稿する。
// 受信者ごとのループ（notifyAdmins）には入れず、notifyTeamChannels から呼ぶ。
export interface TeamChannel {
  readonly name: TeamChannelName;
  send(
    kind: NotificationKind,
    ctx: NotificationContext,
    config: Record<string, unknown>
  ): Promise<void>;
}
