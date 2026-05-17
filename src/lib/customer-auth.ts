import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { getTenantId } from "./tenant";

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

// フィードバック収集モード (DISABLE_AUTH=1) のとき、未ログイン訪問者には
// このテナントの最古 active customer を「ゲスト identity」として割り当てる。
// 既存ログインセッションがある場合はこちらに入らず従来分岐を通る。
async function resolveGuestCustomer(): Promise<CustomerSession | null> {
  const tenantId = await getTenantId();
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id, tenant_id, company_id, name, default_address, phone, contact_email, must_change_password")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    tenant_id: data.tenant_id,
    company_id: data.company_id,
    name: data.name,
    default_address: data.default_address,
    phone: data.phone,
    contact_email: data.contact_email,
    must_change_password: data.must_change_password,
  };
}

export const getCurrentCustomer = cache(async (): Promise<CustomerSession | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const payload = verifySessionToken(token);
  if (!payload) {
    if (process.env.DISABLE_AUTH === "1") return resolveGuestCustomer();
    return null;
  }

  const tenantId = await getTenantId();
  if (payload.tid !== tenantId) return null;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, tenant_id, company_id, name, default_address, phone, contact_email, is_active, must_change_password")
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
