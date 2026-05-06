import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { supabaseAdmin } from "./supabase-admin";

const PRODUCT_DOMAIN = "lease-order.kensetsu-tech.com";
const FALLBACK_SLUG = "union";

function extractSlugFromHost(rawHost: string): string | null {
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

export const getTenantId = cache(async (): Promise<string> => {
  const slug = await resolveSlug();
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`tenant not found: ${slug}`);
  return data.id;
});
