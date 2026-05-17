import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// リース側スタッフは個人名を持たない（admin_users に display_name カラム無し）。
// 顧客への表示は一律「{tenants.name}より」とし、誰が打ったかは伏せる。
// 将来 admin_users.display_name を追加した場合はここに分岐を入れる。
const tenantNameCache = new Map<string, string>();

export async function getTenantDisplayName(tenantId: string): Promise<string> {
  const cached = tenantNameCache.get(tenantId);
  if (cached) return cached;
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  const name = data?.name ?? "リース会社";
  tenantNameCache.set(tenantId, name);
  return name;
}
