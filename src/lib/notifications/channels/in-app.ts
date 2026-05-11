import "server-only";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import type { Channel } from "../types";

export const inAppChannel: Channel = {
  name: "in-app",
  supports() {
    return true;
  },
  async send(target, kind, ctx, tenantId) {
    const recipientId =
      target.kind === "customer" ? target.customerId : target.adminUserId;
    if (!recipientId) return;

    const supabase = await getSupabaseTenant();
    const { error } = await supabase.from("notifications").insert({
      tenant_id: tenantId,
      recipient_type: target.kind,
      recipient_id: recipientId,
      kind,
      order_id: target.orderId,
      payload: {
        orderNumber: ctx.orderNumber,
        companyName: ctx.companyName,
        contactName: ctx.contactName,
        itemSummary: ctx.itemSummary ?? null,
        rejectReason: ctx.rejectReason ?? null,
      },
    });
    if (error) {
      console.error(
        `in-app notification insert failed (${kind} → ${target.kind}:${recipientId})`,
        error
      );
    }
  },
};
