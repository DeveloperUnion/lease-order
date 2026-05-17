import "server-only";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { getTenantId } from "@/lib/tenant";
import { emailChannel } from "./channels/email";
import { inAppChannel } from "./channels/in-app";
import type {
  Channel,
  NotificationContext,
  NotificationKind,
  NotificationTarget,
} from "./types";

export type { NotificationKind, NotificationContext } from "./types";

const ACTIVE_CHANNELS: Channel[] = [emailChannel, inAppChannel];

async function fanout(
  target: NotificationTarget,
  kind: NotificationKind,
  ctx: NotificationContext,
  tenantId: string
): Promise<void> {
  await Promise.all(
    ACTIVE_CHANNELS.filter((c) => c.supports(kind)).map((c) =>
      c.send(target, kind, ctx, tenantId)
    )
  );
}

// Notify the customer who owns the order. Failures are swallowed so the
// caller's business logic never blocks on delivery issues.
//
// after() でレスポンス送信後に fanout を走らせる。これにより email (Resend)
// 送信完了を待たずにフォームのレスポンスが返り、in-app 反映（realtime 経由）
// も結果的に体感が早くなる。
export function notifyCustomer(
  orderId: string,
  kind: NotificationKind,
  extra?: {
    rejectReason?: string;
    itemSummary?: string;
    scheduledDate?: string;
    transportMethod?: "pickup" | "dropoff";
    dropoffOfficeName?: string;
    damageNotes?: string;
  }
): void {
  after(async () => {
    try {
      const tenantId = await getTenantId();
      const supabase = await getSupabaseTenant();
      const { data } = await supabase
        .from("orders")
        .select("order_number, company_name, contact_name, email, customer_id")
        .eq("id", orderId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!data) return;
      if (!data.email && !data.customer_id) return;
      const ctx: NotificationContext = {
        orderNumber: data.order_number,
        companyName: data.company_name,
        contactName: data.contact_name,
        rejectReason: extra?.rejectReason,
        itemSummary: extra?.itemSummary,
        scheduledDate: extra?.scheduledDate,
        transportMethod: extra?.transportMethod,
        dropoffOfficeName: extra?.dropoffOfficeName,
        damageNotes: extra?.damageNotes,
      };
      await fanout(
        {
          kind: "customer",
          customerId: data.customer_id,
          orderId,
          address: data.email ?? "",
        },
        kind,
        ctx,
        tenantId
      );
    } catch (e) {
      console.error(`notifyCustomer failed (${kind}, ${orderId})`, e);
    }
  });
}

// Fan out a notification to every admin in the tenant's allowlist.
// admin_users lookup uses service_role since it lists multiple recipients
// (the same pattern as legacy sendAdminEmail bootstrap).
//
// 各 admin に対し in-app と email の両チャンネルへ fanout する。email チャンネルは
// `target.address` が空なら自身で early-return するので、ここで email 有無の事前
// フィルタはしない（in-app は email 不要で配信されるべき）。
//
// notifyCustomer 同様 after() でレスポンス後に走らせ、フォームのレイテンシを下げる。
export function notifyAdmins(
  tenantId: string,
  kind: NotificationKind,
  ctx: NotificationContext,
  orderId: string | null = null
): void {
  after(async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("admin_users")
        .select("id, email")
        .eq("tenant_id", tenantId);
      if (error) {
        console.error("notifyAdmins: admin_users lookup failed", error);
        return;
      }
      const recipients = data ?? [];
      await Promise.all(
        recipients.map((r) =>
          fanout(
            {
              kind: "admin",
              adminUserId: r.id,
              orderId,
              address: r.email ?? "",
            },
            kind,
            ctx,
            tenantId
          )
        )
      );
    } catch (e) {
      console.error(`notifyAdmins failed (${kind}, ${tenantId})`, e);
    }
  });
}
