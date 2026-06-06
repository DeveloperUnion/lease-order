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
export type RecipientIdentity =
  | { audience: "customer"; recipientId: string; tenantId: string; subject: string }
  | { audience: "admin"; recipientId: string; tenantId: string; subject: string }
  | { audience: "anonymous"; tenantId: string; subject: string };

// 明示的 audience 解決ヘルパー。/api/chat/* など、クライアントが
// 「自分は customer/admin のどちらか」を申告できるエンドポイントで使う。
// セッションが該当する側になければ anonymous を返す → 呼び出し側で 401 に。
//
// resolveRecipientIdentity が「先に見つかった方を使う」推論ベースなのに対し、
// こちらは UI から明示された側に固定するので、同一ブラウザに両セッションが
// 同居していても誤判定しない。
export async function resolveAsCustomer(): Promise<RecipientIdentity> {
  const customer = await getCurrentCustomer();
  if (customer) {
    return {
      audience: "customer",
      recipientId: customer.id,
      tenantId: customer.tenant_id,
      subject: `customer:${customer.id}`,
    };
  }
  const tenantId = await getTenantId();
  return { audience: "anonymous", tenantId, subject: `tenant:${tenantId}` };
}

export async function resolveAsAdmin(): Promise<RecipientIdentity> {
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
      return {
        audience: "admin",
        recipientId: row.id,
        tenantId: row.tenant_id,
        subject: `admin:${row.id}`,
      };
    }
  }
  // 管理者は常時認証必須。Auth セッションが無ければ anonymous（tenant スコープ）。
  const tenantId = await getTenantId();
  return { audience: "anonymous", tenantId, subject: `tenant:${tenantId}` };
}

// 推論ベース（先に見つかった方を採用）。realtime-token など、エンドポイント側で
// 「どっち側か」を確定できない用途用。
// 送信や既読のように「どっち側として処理するか」を明確に分けたい場合は、
// このではなく resolveAsCustomer / resolveAsAdmin を URL ごとに使い分ける。
export async function resolveRecipientIdentity(): Promise<RecipientIdentity> {
  const customer = await getCurrentCustomer();
  if (customer) {
    return {
      audience: "customer",
      recipientId: customer.id,
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
      return {
        audience: "admin",
        recipientId: row.id,
        tenantId: row.tenant_id,
        subject: `admin:${row.id}`,
      };
    }
  }

  const tenantId = await getTenantId();
  return { audience: "anonymous", tenantId, subject: `tenant:${tenantId}` };
}

async function resolveSubjectAndTenant(): Promise<{
  tenantId: string;
  subject: string;
}> {
  const id = await resolveRecipientIdentity();
  return { tenantId: id.tenantId, subject: id.subject };
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
