import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MessageAttachment } from "./types";

const BUCKET = "chat-attachments";
const SIGN_TTL_SECONDS = 60 * 60; // 1 時間
// 吹き出し内サムネイルの最大幅。原寸ではなく Supabase Storage transform で縮小して
// 帯域とデコード時間を節約する。原寸は url の方を別タブで開く想定。
const THUMBNAIL_WIDTH = 800;

export type SignedAttachment = MessageAttachment & {
  url: string | null;
  thumbnail_url: string | null;
};

// React `cache` で同一リクエスト内の path 重複署名を抑止。listMessages × N + 個別 enrich の
// 組み合わせで同じ path を 2 度署名する場面で効く（HTTP roundtrip を避ける）。
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

const signThumbnailUrl = cache(async (path: string): Promise<string | null> => {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGN_TTL_SECONDS, {
        transform: { width: THUMBNAIL_WIDTH, resize: "contain" },
      });
    if (error) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
});

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

// 受信側へ返す前に attachments を署名付き URL に展開する。
// 画像は thumbnail_url（width=800 縮小）も同時に発行し、UI 側で原寸の url とは別扱いする。
// path が無効・期限切れの場合は url/thumbnail_url=null で返し、UI は灰色表示にする想定。
export async function signAttachments(
  attachments: MessageAttachment[]
): Promise<SignedAttachment[]> {
  if (attachments.length === 0) return [];
  return Promise.all(
    attachments.map(async (a) => {
      const [url, thumbnail_url] = await Promise.all([
        signFullUrl(a.path),
        isImage(a.mime) ? signThumbnailUrl(a.path) : Promise.resolve(null),
      ]);
      return { ...a, url, thumbnail_url };
    })
  );
}
