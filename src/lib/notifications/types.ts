export type NotificationKind =
  | "order_received"
  | "order_approved"
  | "order_rejected"
  | "order_shipped"
  | "admin_new_order"
  | "return_requested"
  | "return_acknowledged"
  | "return_rejected"
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

export interface Channel {
  readonly name: "email" | "in-app" | "line";
  supports(kind: NotificationKind): boolean;
  send(
    target: NotificationTarget,
    kind: NotificationKind,
    ctx: NotificationContext,
    tenantId: string
  ): Promise<void>;
}
