import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MessageAttachment } from "./types";

const BUCKET = "chat-attachments";
const SIGN_TTL_SECONDS = 60 * 60; // 1 時間

export type SignedAttachment = MessageAttachment & { url: string | null };

// 受信側へ返す前に attachments を署名付き URL に展開する。
// path が無効・期限切れの場合は url=null で返し、UI は灰色表示にする想定。
export async function signAttachments(
  attachments: MessageAttachment[]
): Promise<SignedAttachment[]> {
  if (attachments.length === 0) return [];
  return Promise.all(
    attachments.map(async (a) => {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(a.path, SIGN_TTL_SECONDS);
        if (error) return { ...a, url: null };
        return { ...a, url: data.signedUrl };
      } catch {
        return { ...a, url: null };
      }
    })
  );
}
