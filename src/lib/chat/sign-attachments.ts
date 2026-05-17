import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MessageAttachment } from "./types";

const BUCKET = "chat-attachments";
const SIGN_TTL_SECONDS = 60 * 60; // 1 時間

export type SignedAttachment = MessageAttachment & { url: string | null };

// React `cache` で同一リクエスト内の path 重複署名を抑止。listMessages × N + 個別 enrich の
// 組み合わせで同じ path を 2 度署名する場面で効く（HTTP roundtrip を避ける）。
// アップロード時のリサイズ（lib/image/resize-client）で原寸自体が縮小済みなので、
// 表示側で更に Storage transform をかけるのは限界効用が小さく、ここでは原寸の signed URL のみ返す。
const signFullUrl = cache(async (path: string): Promise<string | null> => {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGN_TTL_SECONDS);
    if (error) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
});

// 受信側へ返す前に attachments を署名付き URL に展開する。
// path が無効・期限切れの場合は url=null で返し、UI は灰色表示にする想定。
export async function signAttachments(
  attachments: MessageAttachment[]
): Promise<SignedAttachment[]> {
  if (attachments.length === 0) return [];
  return Promise.all(
    attachments.map(async (a) => ({ ...a, url: await signFullUrl(a.path) }))
  );
}
