import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slackChannel } from "./slack";
import type { TeamChannel, TeamChannelName } from "../types";

// 連携先の実装レジストリ。後追いで chatwork / line_works を足すときはここに追加。
const TEAM_CHANNELS: Record<TeamChannelName, TeamChannel | undefined> = {
  slack: slackChannel,
  chatwork: undefined,
  line_works: undefined,
};

export type EnabledTeamChannel = {
  channel: TeamChannel;
  config: Record<string, unknown>;
};

// テナントの有効な共有チャンネルを返す。admin_new_order は公開の発注フロー
// （管理者セッションなし）からも発火するため、設定読取は service_role で行う。
export async function getEnabledTeamChannels(
  tenantId: string
): Promise<EnabledTeamChannel[]> {
  const { data, error } = await supabaseAdmin
    .from("notification_channels")
    .select("channel, config")
    .eq("tenant_id", tenantId)
    .eq("enabled", true);
  if (error) {
    console.error("getEnabledTeamChannels failed", error);
    return [];
  }
  const result: EnabledTeamChannel[] = [];
  for (const row of data ?? []) {
    const channel = TEAM_CHANNELS[row.channel as TeamChannelName];
    if (!channel) continue; // 実装がまだ無い連携先（chatwork/line_works）はスキップ
    result.push({
      channel,
      config: (row.config ?? {}) as Record<string, unknown>,
    });
  }
  return result;
}
