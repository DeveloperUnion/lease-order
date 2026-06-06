import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { BillingRule } from "./pricing";

// 運営者(super-admin)コンソール用の cross-tenant データアクセス。
// すべて service_role(supabaseAdmin) 経由。tenant JWT / RLS は通さない。
// 呼び出し元(Server Action)は requireSuperAdmin() で権限を担保すること。

export type TenantListRow = {
  id: string;
  slug: string;
  name: string;
  billing_rule: BillingRule;
  created_at: string;
  adminCount: number;
  customerCount: number;
  orderCount: number;
};

export type TenantAdminRow = {
  id: string;
  email: string;
  created_at: string;
};

export type TenantDetail = {
  id: string;
  slug: string;
  name: string;
  billing_rule: BillingRule;
  created_at: string;
  admins: TenantAdminRow[];
  customerCount: number;
  orderCount: number;
};

async function countRows(
  table: "admin_users" | "customers" | "orders",
  tenantId: string
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) {
    console.error(`countRows(${table}) failed`, error);
    return 0;
  }
  return count ?? 0;
}

export async function listTenants(): Promise<TenantListRow[]> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, slug, name, billing_rule, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];

  return Promise.all(
    rows.map(async (t) => {
      const [adminCount, customerCount, orderCount] = await Promise.all([
        countRows("admin_users", t.id),
        countRows("customers", t.id),
        countRows("orders", t.id),
      ]);
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        billing_rule: (t.billing_rule ?? { type: "monthly" }) as BillingRule,
        created_at: t.created_at,
        adminCount,
        customerCount,
        orderCount,
      };
    })
  );
}

export async function getTenantDetail(id: string): Promise<TenantDetail | null> {
  const { data: t, error } = await supabaseAdmin
    .from("tenants")
    .select("id, slug, name, billing_rule, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!t) return null;

  const [admins, customerCount, orderCount] = await Promise.all([
    listTenantAdmins(t.id),
    countRows("customers", t.id),
    countRows("orders", t.id),
  ]);

  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    billing_rule: (t.billing_rule ?? { type: "monthly" }) as BillingRule,
    created_at: t.created_at,
    admins,
    customerCount,
    orderCount,
  };
}

export async function listTenantAdmins(tenantId: string): Promise<TenantAdminRow[]> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, email, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TenantAdminRow[];
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export type CreateTenantInput = {
  name: string;
  slug: string;
  billingRule?: BillingRule;
};

export type CreateTenantResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name) return { ok: false, error: "テナント名は必須です" };
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: "slug は英小文字・数字・ハイフンのみ（先頭末尾は英数字、2〜32文字）",
    };
  }
  // 予約 slug: super-admin（運営コンソール）/ staging（staging ゾーン apex）と衝突するため。
  if (slug === "super-admin" || slug === "staging" || slug.startsWith("super-admin")) {
    return { ok: false, error: "この slug は予約済みです" };
  }

  const billing_rule = input.billingRule ?? { type: "monthly" };
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .insert({ name, slug, billing_rule })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: "その slug は既に使われています" };
    }
    console.error("createTenant error", error);
    return { ok: false, error: "テナントの作成に失敗しました" };
  }
  return { ok: true, id: data.id };
}

export type UpdateTenantInput = {
  id: string;
  name?: string;
  billingRule?: BillingRule;
};

export async function updateTenant(
  input: UpdateTenantInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "テナント名は必須です" };
    patch.name = name;
  }
  if (input.billingRule !== undefined) patch.billing_rule = input.billingRule;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabaseAdmin.from("tenants").update(patch).eq("id", input.id);
  if (error) {
    console.error("updateTenant error", error);
    return { ok: false, error: "更新に失敗しました" };
  }
  return { ok: true };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function addTenantAdmin(
  tenantId: string,
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません" };
  }
  const { error } = await supabaseAdmin
    .from("admin_users")
    .insert({ tenant_id: tenantId, email: normalized });
  if (error) {
    // admin_users.email は UNIQUE（1 メール = 1 テナント）。
    if (error.code === "23505") {
      return { ok: false, error: "このメールは既にいずれかのテナントの管理者です" };
    }
    console.error("addTenantAdmin error", error);
    return { ok: false, error: "管理者の追加に失敗しました" };
  }
  return { ok: true };
}

export async function removeTenantAdmin(
  adminUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin.from("admin_users").delete().eq("id", adminUserId);
  if (error) {
    console.error("removeTenantAdmin error", error);
    return { ok: false, error: "管理者の削除に失敗しました" };
  }
  return { ok: true };
}
