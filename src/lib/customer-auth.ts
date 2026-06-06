import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { getTenant, getTenantId } from "./tenant";

const COOKIE_NAME = "lo_customer";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type CustomerSession = {
  id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  default_address: string | null;
  phone: string | null;
  contact_email: string | null;
  email_verified: boolean;
  must_change_password: boolean;
};

type Payload = { cid: string; tid: string; iat: number };

function getSecret(): string {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET is not set");
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signSessionToken(payload: Payload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = b64urlEncode(createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): Payload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", getSecret()).update(body).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;
  try {
    const decoded = JSON.parse(b64urlDecode(body).toString("utf8")) as Payload;
    if (typeof decoded.cid !== "string" || typeof decoded.tid !== "string") return null;
    if (typeof decoded.iat !== "number") return null;
    if (Date.now() / 1000 - decoded.iat > MAX_AGE_SECONDS) return null;
    return decoded;
  } catch {
    return null;
  }
}

export const getCurrentCustomer = cache(async (): Promise<CustomerSession | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const tenantId = await getTenantId();
  if (payload.tid !== tenantId) return null;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, tenant_id, company_id, name, default_address, phone, contact_email, email_verified, is_active, must_change_password")
    .eq("id", payload.cid)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;

  return {
    id: data.id,
    tenant_id: data.tenant_id,
    company_id: data.company_id,
    name: data.name,
    default_address: data.default_address,
    phone: data.phone,
    contact_email: data.contact_email,
    email_verified: data.email_verified ?? false,
    must_change_password: data.must_change_password,
  };
});

export async function requireCustomer(
  opts?: { allowMustChangePassword?: boolean }
): Promise<CustomerSession> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");
  if (customer.must_change_password && !opts?.allowMustChangePassword) {
    redirect("/account?reset=1");
  }
  return customer;
}

// カタログ閲覧（入口）用のゲート。
//   - ログイン済み → 通常の customer を返す（must_change_password なら /account?reset=1）。
//   - 未ログイン   → tenant.customer_access_mode が 'login' なら /login へ。
//                    'guest_browse' なら null を返してゲスト閲覧を許可する。
// 発注・履歴・rentals は引き続き requireCustomer でログイン必須を維持する。
export async function gateCatalogAccess(): Promise<CustomerSession | null> {
  const customer = await getCurrentCustomer();
  if (customer) {
    if (customer.must_change_password) redirect("/account?reset=1");
    return customer;
  }
  const tenant = await getTenant();
  if (tenant.customer_access_mode === "login") redirect("/login");
  return null;
}

export async function setCustomerSession(customerId: string, tenantId: string): Promise<void> {
  const token = signSessionToken({ cid: customerId, tid: tenantId, iat: Math.floor(Date.now() / 1000) });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const CUSTOMER_COOKIE_NAME = COOKIE_NAME;
