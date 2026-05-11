import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
export async function notifyCustomer(
  orderId: string,
  kind: NotificationKind,
  extra?: { rejectReason?: string; itemSummary?: string }
): Promise<void> {
  try {
    const tenantId = await getTenantId();
    const { data } = await supabaseAdmin
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
}

// Fan out a notification to every admin in the tenant's allowlist.
export async function notifyAdmins(
  tenantId: string,
  kind: NotificationKind,
  ctx: NotificationContext,
  orderId: string | null = null
): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("id, email")
      .eq("tenant_id", tenantId);
    if (error) {
      console.error("notifyAdmins: admin_users lookup failed", error);
      return;
    }
    const recipients = (data ?? []).filter((r) => r.email);
    await Promise.all(
      recipients.map((r) =>
        fanout(
          {
            kind: "admin",
            adminUserId: r.id,
            orderId,
            address: r.email,
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
}
