import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import { generateTempPassword } from "./temp-password";
import { ensureAuthUser } from "./admin-auth-provision";
import { sendTransactionalEmail } from "./mailer";
import type { BillingRule } from "./pricing";
import {
  tenantStatusDisplay,
  type TenantStatus,
  type TenantStatusDisplay,
} from "./tenant-status";

// 運営者(super-admin)コンソール用の cross-tenant データアクセス。
// すべて service_role(supabaseAdmin) 経由。tenant JWT / RLS は通さない。
// 呼び出し元(Server Action)は requireSuperAdmin() で権限を担保すること。

export type { TenantStatus } from "./tenant-status";

// トライアルの付与単位（固定30日）。
export const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TenantListRow = {
  id: string;
  slug: string;
  name: string;
  billing_rule: BillingRule;
  status: TenantStatus;
  trial_ends_at: string | null;
  // 残り日数等の時刻依存表示はデータ層（リクエスト時刻）で算出して渡す。
  statusDisplay: TenantStatusDisplay;
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
  status: TenantStatus;
  trial_ends_at: string | null;
  statusDisplay: TenantStatusDisplay;
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
    .select("id, slug, name, billing_rule, status, trial_ends_at, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const nowMs = Date.now();

  return Promise.all(
    rows.map(async (t) => {
      const [adminCount, customerCount, orderCount] = await Promise.all([
        countRows("admin_users", t.id),
        countRows("customers", t.id),
        countRows("orders", t.id),
      ]);
      const status = (t.status as TenantStatus | null) ?? "active";
      const trial_ends_at = (t.trial_ends_at as string | null) ?? null;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        billing_rule: (t.billing_rule ?? { type: "monthly" }) as BillingRule,
        status,
        trial_ends_at,
        statusDisplay: tenantStatusDisplay(status, trial_ends_at, nowMs),
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
    .select("id, slug, name, billing_rule, status, trial_ends_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!t) return null;

  const [admins, customerCount, orderCount] = await Promise.all([
    listTenantAdmins(t.id),
    countRows("customers", t.id),
    countRows("orders", t.id),
  ]);
  const status = (t.status as TenantStatus | null) ?? "active";
  const trial_ends_at = (t.trial_ends_at as string | null) ?? null;

  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    billing_rule: (t.billing_rule ?? { type: "monthly" }) as BillingRule,
    status,
    trial_ends_at,
    statusDisplay: tenantStatusDisplay(status, trial_ends_at, Date.now()),
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
  // true なら status='trial' + trial_ends_at = 今 + TRIAL_DAYS で作成。
  asTrial?: boolean;
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
  const trial = input.asTrial
    ? {
        status: "trial" as const,
        trial_ends_at: new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString(),
      }
    : {};
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .insert({ name, slug, billing_rule, ...trial })
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

type TenantMutationResult = { ok: true } | { ok: false; error: string };

// 本契約に切り替え：status='active' / trial_ends_at=null（以後ロックされない）。
export async function convertTenantToActive(id: string): Promise<TenantMutationResult> {
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ status: "active", trial_ends_at: null })
    .eq("id", id);
  if (error) {
    console.error("convertTenantToActive error", error);
    return { ok: false, error: "本契約への切り替えに失敗しました" };
  }
  return { ok: true };
}

// トライアル延長：任意日数を加算。期限切れ後でも「今」を基点に延長し、status を
// trial に戻す（停止中からの再開にも使える）。
export async function extendTrial(id: string, days: number): Promise<TenantMutationResult> {
  if (!Number.isFinite(days) || days <= 0) {
    return { ok: false, error: "延長日数は1以上で指定してください" };
  }
  const { data: t, error: readErr } = await supabaseAdmin
    .from("tenants")
    .select("trial_ends_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !t) {
    return { ok: false, error: "テナントが見つかりません" };
  }
  const now = Date.now();
  const current = t.trial_ends_at ? new Date(t.trial_ends_at as string).getTime() : now;
  const base = Math.max(now, current);
  const newEnd = new Date(base + days * DAY_MS).toISOString();
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ status: "trial", trial_ends_at: newEnd })
    .eq("id", id);
  if (error) {
    console.error("extendTrial error", error);
    return { ok: false, error: "トライアルの延長に失敗しました" };
  }
  return { ok: true };
}

// 即時停止：status='suspended'（trial_ends_at に関係なく完全ロック）。
export async function suspendTenant(id: string): Promise<TenantMutationResult> {
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ status: "suspended" })
    .eq("id", id);
  if (error) {
    console.error("suspendTenant error", error);
    return { ok: false, error: "停止に失敗しました" };
  }
  return { ok: true };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type AddTenantAdminResult =
  | { ok: true; email: string; tempPassword: string; emailSent: boolean }
  | { ok: false; error: string };

// テナント管理者を招待する。admin はパスワード認証なので、admin_users 行だけでなく
// Supabase Auth ユーザーを仮パスワード付きで発行し、auth_user_id を保持する
// （/admin の addAdminUser と同じ流れ）。発行後、招待メール（初期パスワード＋
// ログイン案内）を本人宛に送信する。baseDomain は prod/staging で異なる
// ログイン URL を組むために呼び出し側から渡す。
export async function addTenantAdmin(
  tenantId: string,
  email: string,
  baseDomain: string
): Promise<AddTenantAdminResult> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません" };
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("slug, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) {
    return { ok: false, error: "テナントが見つかりません" };
  }

  // admin_users.email は global unique。auth ユーザーを無駄に作る前に弾く。
  const { data: existing } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "このメールは既にいずれかのテナントの管理者です" };
  }

  const tempPassword = generateTempPassword();
  let authUserId: string;
  try {
    authUserId = await ensureAuthUser(normalized, tempPassword);
  } catch (e) {
    console.error("addTenantAdmin ensureAuthUser error", e);
    return { ok: false, error: "認証ユーザーの発行に失敗しました" };
  }

  const { error } = await supabaseAdmin.from("admin_users").insert({
    tenant_id: tenantId,
    email: normalized,
    auth_user_id: authUserId,
    must_change_password: true,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "このメールは既にいずれかのテナントの管理者です" };
    }
    console.error("addTenantAdmin error", error);
    return { ok: false, error: "管理者の追加に失敗しました" };
  }

  // 招待メール送信（best-effort）。失敗しても招待自体は成功とし、画面表示の
  // 初期パスワードで手動共有できるようにする。
  const loginUrl = `https://${tenant.slug}.${baseDomain}/admin`;
  const mail = await sendTransactionalEmail({
    to: normalized,
    fromName: "Union",
    subject: `【発注 for リース】${tenant.name} 管理コンソールへの招待`,
    text:
      `${tenant.name} の管理コンソールに招待されました。\n\n` +
      `以下の情報でサインインできます。\n\n` +
      `  ログイン URL : ${loginUrl}\n` +
      `  メールアドレス: ${normalized}\n` +
      `  初期パスワード: ${tempPassword}\n\n` +
      `セキュリティのため、初回サインイン後にパスワードの変更が必要です。\n` +
      `本メールに心当たりがない場合は破棄してください。`,
  });
  if (!mail.ok) {
    console.warn("addTenantAdmin invite email not sent:", mail.error);
  }

  return { ok: true, email: normalized, tempPassword, emailSent: mail.ok };
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
