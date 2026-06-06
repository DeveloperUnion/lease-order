import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";
import type { BillingRule } from "./pricing";

export type Tenant = {
  id: string;
  slug: string;
  billing_rule: BillingRule;
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
    .select("id, slug, billing_rule")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`tenant not found: ${slug}`);
  return {
    id: data.id,
    slug: data.slug,
    billing_rule: (data.billing_rule ?? { type: "monthly" }) as BillingRule,
  };
});

export const getTenantId = cache(async (): Promise<string> => {
  return (await getTenant()).id;
});
