import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { resolveAsAdmin } from "@/lib/supabase-tenant";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/admin/notifications-settings";
const STATE_COOKIE = "slack_oauth_state";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL(SETTINGS_PATH, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  // 使い終わった CSRF nonce は破棄する
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

// Slack OAuth (incoming-webhook) のコールバック。
// 担当者が Slack でチャンネルを選択・許可すると Slack がここへ戻ってくる。
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const slackError = url.searchParams.get("error"); // ユーザーが許可を拒否した等

  if (slackError) return back(request, { error: slackError });
  if (!code) return back(request, { error: "missing_code" });

  // CSRF: 開始時に cookie へ保存した nonce と一致するか
  const expected = (await cookies()).get(STATE_COOKIE)?.value;
  if (!expected || !state || state !== expected) {
    return back(request, { error: "state_mismatch" });
  }

  // テナントは host ベースの認証セッションから確定（state には載せない）。
  // 管理者セッションが無ければ連携させない。
  const identity = await resolveAsAdmin();
  if (identity.audience !== "admin") {
    return back(request, { error: "not_admin" });
  }
  const tenantId = identity.tenantId;

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return back(request, { error: "not_configured" });
  }

  // 認可コードをアクセストークン（と incoming_webhook）に交換。
  // redirect_uri は authorize 時と完全一致させる必要がある。
  const redirectUri = `${url.origin}/api/integrations/slack/callback`;
  let payload: {
    ok: boolean;
    error?: string;
    team?: { id?: string; name?: string };
    incoming_webhook?: { url?: string; channel?: string; channel_id?: string };
  };
  try {
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    payload = await res.json();
  } catch (e) {
    console.error("slack oauth.v2.access failed", e);
    return back(request, { error: "exchange_failed" });
  }

  if (!payload.ok || !payload.incoming_webhook?.url) {
    console.error("slack oauth.v2.access not ok", payload.error);
    return back(request, { error: payload.error ?? "no_webhook" });
  }

  const config = {
    webhookUrl: payload.incoming_webhook.url,
    channelName: payload.incoming_webhook.channel ?? null,
    channelId: payload.incoming_webhook.channel_id ?? null,
    teamName: payload.team?.name ?? null,
  };

  const { error } = await supabaseAdmin.from("notification_channels").upsert(
    {
      tenant_id: tenantId,
      channel: "slack",
      enabled: true,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,channel" }
  );
  if (error) {
    console.error("notification_channels upsert failed", error);
    return back(request, { error: "save_failed" });
  }

  return back(request, { connected: "slack" });
}
