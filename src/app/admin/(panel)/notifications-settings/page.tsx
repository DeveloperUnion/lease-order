import { getTenantId } from "@/lib/tenant";
import { getSupabaseTenant } from "@/lib/supabase-tenant";
import NotificationSettingsView, {
  type SlackConnection,
} from "./notification-settings-view";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const tenantId = await getTenantId();
  const supabase = await getSupabaseTenant();
  const { data } = await supabase
    .from("notification_channels")
    .select("enabled, config")
    .eq("tenant_id", tenantId)
    .eq("channel", "slack")
    .maybeSingle();

  let slack: SlackConnection = null;
  if (data?.enabled) {
    const config = (data.config ?? {}) as Record<string, unknown>;
    slack = {
      teamName: typeof config.teamName === "string" ? config.teamName : null,
      channelName:
        typeof config.channelName === "string" ? config.channelName : null,
    };
  }

  return <NotificationSettingsView slack={slack} />;
}
