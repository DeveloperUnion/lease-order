import "server-only";
import { supabaseAdmin } from "./supabase-admin";

// 顧客の company_id を採番する: C-<year>-<seq> 形式。
// admin によるアカウント発行（createCustomer）と会員登録（registerCustomer）の
// 両方から使う。並走登録で同一 seq に当たると customers の unique(tenant_id, company_id)
// で弾かれるため、呼び出し側は unique 違反時にリトライする想定。
export async function nextCompanyId(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `C-${year}-`;
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("company_id")
    .eq("tenant_id", tenantId)
    .like("company_id", `${prefix}%`);
  if (error) throw error;
  const maxSeq = (data ?? []).reduce((m, row) => {
    const match = /^C-\d{4}-(\d+)$/.exec((row as { company_id: string }).company_id);
    if (!match) return m;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const seq = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}
