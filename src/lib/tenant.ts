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
const FALLBACK_SLUG = "union";

// super-admin（運営者）コンソール専用ホスト判定。
//   本番:    super-admin.lease-order.kensetsu-tech.com
//   staging: staging.super-admin.lease-order.kensetsu-tech.com
//   ローカル: super-admin.localhost:3000（*.localhost は 127.0.0.1 に解決される）
// staging. を剥がした上で super-admin. 始まりかどうかで一括判定する。
export function isSuperAdminHost(rawHost: string): boolean {
  const host = rawHost.split(":")[0].toLowerCase();
  const noStaging = host.startsWith("staging.") ? host.slice("staging.".length) : host;
  return noStaging.startsWith("super-admin.");
}

export function extractSlugFromHost(rawHost: string): string | null {
  // super-admin ホストはテナントではない。slug "super-admin" として誤って
  // getTenant に渡ると tenant not found で落ちるため、ここで明示的に除外する。
  if (isSuperAdminHost(rawHost)) return null;
  const host = rawHost.split(":")[0].toLowerCase();
  const noStaging = host.startsWith("staging.") ? host.slice("staging.".length) : host;
  if (noStaging === PRODUCT_DOMAIN) return FALLBACK_SLUG;
  const suffix = "." + PRODUCT_DOMAIN;
  if (noStaging.endsWith(suffix)) return noStaging.slice(0, -suffix.length);
  return null;
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
