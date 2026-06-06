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
const FALLBACK_SLUG = "union";

export function extractSlugFromHost(rawHost: string): string | null {
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
