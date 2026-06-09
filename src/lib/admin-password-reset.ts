import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";

// 管理者(admin)のセルフサービス パスワード再設定トークンの発行・検証・消費。
// raw トークンはメールにのみ載せ、DB には SHA-256 ハッシュだけを保存する。
// 保存テーブルは admin_password_resets（migration 0037）。service_role 経由でのみ触る。

const TOKEN_TTL_MS = 60 * 60 * 1000; // 60 分

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ResetTokenTarget = {
  adminUserId: string;
  email: string;
  tenantId: string;
  authUserId: string | null;
};

// トークンを発行・保存し、メールに載せる raw トークンを返す。
export async function createAdminPasswordResetToken(
  adminUserId: string
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("admin_password_resets").insert({
    admin_user_id: adminUserId,
    token_hash: hashToken(raw),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return raw;
}

// 消費せずに有効性だけを確認する（reset ページの初期表示で期限切れを早期表示するため）。
export async function peekAdminPasswordResetToken(raw: string): Promise<boolean> {
  if (!raw) return false;
  const { data } = await supabaseAdmin
    .from("admin_password_resets")
    .select("expires_at, used_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data || data.used_at) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

// 検証して used_at を立て、対象 admin_user を返す（単回使用）。無効なら null。
export async function consumeAdminPasswordResetToken(
  raw: string
): Promise<ResetTokenTarget | null> {
  if (!raw) return null;
  const { data, error } = await supabaseAdmin
    .from("admin_password_resets")
    .select(
      "id, expires_at, used_at, admin_users!inner(id, email, tenant_id, auth_user_id)"
    )
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (error || !data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  // used_at を条件付き UPDATE で立て、二重消費（競合）を防ぐ。
  const { data: claimed } = await supabaseAdmin
    .from("admin_password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return null;

  const admin = data.admin_users as unknown as {
    id: string;
    email: string;
    tenant_id: string;
    auth_user_id: string | null;
  };
  return {
    adminUserId: admin.id,
    email: admin.email,
    tenantId: admin.tenant_id,
    authUserId: admin.auth_user_id,
  };
}
