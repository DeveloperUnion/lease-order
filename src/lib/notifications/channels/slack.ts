import "server-only";
import { renderChatMessage } from "../templates";
import type { TeamChannel } from "../types";

// Slack Incoming Webhook（OAuth v2 で発行された URL）にテキストを 1 件投稿する。
// 送信失敗は握りつぶして console.error のみ（email チャネルと同じ温度感。
// 業務ロジックを通知の不達でブロックしない）。
export const slackChannel: TeamChannel = {
  name: "slack",
  async send(kind, ctx, config) {
    const webhookUrl =
      typeof config.webhookUrl === "string" ? config.webhookUrl : "";
    if (!webhookUrl) return;

    const text = renderChatMessage(kind, ctx);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(
          `slack send failed (${kind}): ${res.status} ${detail}`
        );
      }
    } catch (e) {
      console.error(`slack send failed (${kind})`, e);
    }
  },
};
