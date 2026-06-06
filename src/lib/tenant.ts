import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";
import type { BillingRule } from "./pricing";

export type CustomerAccessMode = "login" | "guest_browse";

export type Tenant = {
  id: string;
  slug: string;
  billing_rule: BillingRule;
  customer_access_mode: CustomerAccessMode;
};

const PRODUCT_DOMAIN = "lease-order.kensetsu-tech.com";
// staging はワイルドカード可能な形 <slug>.staging.lease-order... を採用する。
// （staging.<slug>.lease-order... だと staging.*.lease-order が DNS 上不正で
//  ワイルドカードにできないため、slug を左に寄せて *.staging.lease-order を効かせる）
const STAGING_DOMAIN = `staging.${PRODUCT_DOMAIN}`;
const FALLBACK_SLUG = "union";

// super-admin（運営者）コンソール専用ホスト判定。
//   本番:    super-admin.lease-order.kensetsu-tech.com
//   staging: super-admin.staging.lease-order.kensetsu-tech.com
//   ローカル: super-admin.localhost:3000（*.localhost は 127.0.0.1 に解決される）
// prod/staging/local いずれも「先頭ラベルが super-admin か」で一括判定できる。
// slug "super-admin" はテナント作成時に予約済み（createTenant）なので衝突しない。
export function isSuperAdminHost(rawHost: string): boolean {
  const host = rawHost.split(":")[0].toLowerCase();
  return host.split(".")[0] === "super-admin";
}

// 指定ゾーン内での slug を返す。host がゾーンちょうど（apex）なら FALLBACK、
// ゾーンのサブドメインなら左ラベルを slug として返す。該当しなければ null。
function slugForZone(host: string, zone: string): string | null {
  if (host === zone) return FALLBACK_SLUG;
  const suffix = `.${zone}`;
  if (host.endsWith(suffix)) return host.slice(0, -suffix.length);
  return null;
}

export function extractSlugFromHost(rawHost: string): string | null {
  // super-admin ホストはテナントではない。slug "super-admin" として誤って
  // getTenant に渡ると tenant not found で落ちるため、ここで明示的に除外する。
  if (isSuperAdminHost(rawHost)) return null;
  const host = rawHost.split(":")[0].toLowerCase();
  // staging ゾーン（<slug>.staging.lease-order... / staging.lease-order...）を先に判定。
  // prod ゾーン（.lease-order...）にも末尾一致するため、評価順が重要。
  return slugForZone(host, STAGING_DOMAIN) ?? slugForZone(host, PRODUCT_DOMAIN);
}

// super-admin コンソールのホストから、テナントが使うベースドメインを導く。
//   super-admin.lease-order...         → lease-order...        （prod）
//   super-admin.staging.lease-order... → staging.lease-order... （staging）
// これで super-admin の UI が prod/staging で正しいテナント URL を表示できる。
export function tenantBaseDomainFromHost(rawHost: string): string {
  const host = rawHost.split(":")[0].toLowerCase();
  const prefix = "super-admin.";
  return host.startsWith(prefix) ? host.slice(prefix.length) : host;
}

// 現在のリクエスト host から tenantBaseDomain を解決する（server 専用）。
export async function getTenantBaseDomain(): Promise<string> {
  const host = (await headers()).get("host") ?? PRODUCT_DOMAIN;
  return tenantBaseDomainFromHost(host);
}

async function resolveSlug(): Promise<string> {
  const host = (await headers()).get("host");
  if (host) {
    const slug = extractSlugFromHost(host);
    if (slug) return slug;
  }
  return FALLBACK_SLUG;
}

export const getTenantSlug = cache(resolveSlug);

export const getTenant = cache(async (): Promise<Tenant> => {
  const slug = await resolveSlug();
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, slug, billing_rule, customer_access_mode")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`tenant not found: ${slug}`);
  return {
    id: data.id,
    slug: data.slug,
    billing_rule: (data.billing_rule ?? { type: "monthly" }) as BillingRule,
    customer_access_mode:
      (data.customer_access_mode as CustomerAccessMode | null) ?? "guest_browse",
  };
});

export const getTenantId = cache(async (): Promise<string> => {
  return (await getTenant()).id;
});

// proxy（middleware）から host 文字列だけで customer_access_mode を解決する。
// proxy は headers() を使えないため getTenant() とは別経路で引く。未登録 host や
// 取得失敗時は安全側に倒さず guest_browse（公開）を既定にする＝発注系は別途
// requireCustomer で守られているため、入口公開のデフォルトと整合する。
export async function getCustomerAccessModeByHost(
  rawHost: string | null
): Promise<CustomerAccessMode> {
  const slug = rawHost ? extractSlugFromHost(rawHost) ?? FALLBACK_SLUG : FALLBACK_SLUG;
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("customer_access_mode")
    .eq("slug", slug)
    .maybeSingle();
  return (data?.customer_access_mode as CustomerAccessMode | null) ?? "guest_browse";
}

// トライアル期限切れ / 手動停止のテナントを完全ロックするための判定。
// proxy（middleware）から host だけで引く。customer_access_mode とは別クエリにして
// 疎結合に保つ（status/trial_ends_at 列が未適用の環境ではクエリが error になるが、
// その場合は安全側で false ＝ロックしない）。判定は遅延評価で cron 不要：
//   ロック = status='suspended' OR (status='trial' AND trial_ends_at < now())
export async function isTenantLockedByHost(rawHost: string | null): Promise<boolean> {
  const slug = rawHost ? extractSlugFromHost(rawHost) ?? FALLBACK_SLUG : FALLBACK_SLUG;
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("status, trial_ends_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return false;
  const status = data.status as string | null;
  if (status === "suspended") return true;
  if (status === "trial") {
    const ends = data.trial_ends_at as string | null;
    return !!ends && new Date(ends).getTime() < Date.now();
  }
  return false;
}
