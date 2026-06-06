"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/lib/tenant";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slackChannel } from "@/lib/notifications/channels/slack";
import type { NotificationContext } from "@/lib/notifications/types";

const STATE_COOKIE = "slack_oauth_state";
const CALLBACK_PATH = "/api/integrations/slack/callback";

async function originFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

// "Slackと連携" ボタンの遷移先 authorize URL を返す。
// CSRF 用 nonce を httpOnly cookie に保存し、コールバックで照合する。
export async function startSlackConnect(): Promise<{ url: string }> {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error("Slack 連携が未設定です（SLACK_CLIENT_ID）");

  const nonce = randomUUID();
  (await cookies()).set(STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const redirectUri = `${await originFromHeaders()}${CALLBACK_PATH}`;
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "incoming-webhook");
  url.searchParams.set("state", nonce);
  url.searchParams.set("redirect_uri", redirectUri);
  return { url: url.toString() };
}

export async function disconnectSlack(): Promise<void> {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { error } = await supabase
    .from("notification_channels")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("channel", "slack");
  if (error) throw new Error(`連携解除に失敗しました: ${error.message}`);
  revalidatePath("/admin/notifications-settings");
}

// 保存済みの Slack 設定でテストメッセージを 1 件送る。
export async function sendTestSlack(): Promise<void> {
  const tenantId = await getTenantId();
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("config, enabled")
    .eq("tenant_id", tenantId)
    .eq("channel", "slack")
    .maybeSingle();
  if (error) throw new Error(`設定の取得に失敗しました: ${error.message}`);
  if (!data) throw new Error("Slack が連携されていません");

  const config = (data.config ?? {}) as Record<string, unknown>;
  if (typeof config.webhookUrl !== "string" || !config.webhookUrl) {
    throw new Error("Webhook URL が見つかりません。連携をやり直してください");
  }

  const ctx: NotificationContext = {
    orderNumber: "TEST-0001",
    companyName: "テスト株式会社",
    contactName: "テスト 太郎",
    itemSummary: "単管パイプ ×10 ほか",
  };
  await slackChannel.send("admin_new_order", ctx, config);
}
