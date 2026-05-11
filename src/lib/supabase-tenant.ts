import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintTenantJwt } from "./supabase-jwt";
import { getTenantId } from "./tenant";
import { getCurrentCustomer } from "./customer-auth";
import { createSupabaseServerClient } from "./supabase-server";
import { supabaseAdmin } from "./supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// tenant_id を claim に乗せた JWT 付きの Supabase クライアントを返す。
// RLS ポリシーが `(auth.jwt() ->> 'tenant_id')` を参照することで、
// アプリ層フィルタ忘れがあっても cross-tenant leak を SQL レベルで防ぐ。
//
// subject の解決順:
//   1. 顧客 session (HMAC cookie) → customer:<id> + customer.tenant_id
//   2. 管理者 session (Supabase Auth) → admin:<admin_user_id> + admin_user.tenant_id
//   3. fallback → tenant:<host から解決した tenant_id>（login 前など）
async function resolveSubjectAndTenant(): Promise<{
  tenantId: string;
  subject: string;
}> {
  const customer = await getCurrentCustomer();
  if (customer) {
    return {
      tenantId: customer.tenant_id,
      subject: `customer:${customer.id}`,
    };
  }

  const ssr = await createSupabaseServerClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (user?.email) {
    const { data: row } = await supabaseAdmin
      .from("admin_users")
      .select("id, tenant_id")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    if (row) {
      return { tenantId: row.tenant_id, subject: `admin:${row.id}` };
    }
  }

  const tenantId = await getTenantId();
  return { tenantId, subject: `tenant:${tenantId}` };
}

export const getSupabaseTenant = cache(
  async (): Promise<SupabaseClient> => {
    const { tenantId, subject } = await resolveSubjectAndTenant();
    const jwt = mintTenantJwt({ tenantId, subject });
    return createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
);
