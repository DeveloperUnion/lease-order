import "server-only";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { renderTemplate } from "../templates";
import type { Channel } from "../types";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || "onboarding@resend.dev";
const resend = apiKey ? new Resend(apiKey) : null;

export const emailChannel: Channel = {
  name: "email",
  supports() {
    return true;
  },
  async send(target, kind, ctx, tenantId) {
    // address 未設定 = email 連絡先なし。email_logs にも残さず黙ってスキップする
    // （in-app チャンネルは別途配信される）。
    if (!target.address) return;
    const { subject, body } = renderTemplate(kind, ctx);

    let status: "sent" | "skipped" | "failed" = "skipped";
    let errorMsg: string | null = null;

    if (resend) {
      try {
        const result = await resend.emails.send({
          from: fromAddress,
          to: target.address,
          subject,
          text: body,
        });
        if (result.error) {
          status = "failed";
          errorMsg = result.error.message;
        } else {
          status = "sent";
        }
      } catch (e) {
        status = "failed";
        errorMsg = e instanceof Error ? e.message : String(e);
      }
    } else {
      errorMsg = "RESEND_API_KEY is not configured";
    }

    await supabaseAdmin.from("email_logs").insert({
      tenant_id: tenantId,
      order_id: target.orderId,
      to_address: target.address,
      subject,
      body,
      kind,
      status,
      error: errorMsg,
    });

    if (status === "failed") {
      console.error(
        `email send failed (${kind} → ${target.address}): ${errorMsg}`
      );
    }
  },
};
