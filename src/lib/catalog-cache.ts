import "server-only";
import { updateTag } from "next/cache";
import { deleteByPrefix } from "./redis-cache";

// admin が資材・カテゴリ・営業所を更新したときに呼ぶ catalog 無効化。
//
//   1) Next.js 側: updateTag("catalog") で unstable_cache 配下を invalidate
//   2) Redis 側: catalog: prefix の key を全削除
//
// Redis が未設定なら 2) は no-op で 1) だけ走る。
export async function revalidateCatalog(): Promise<void> {
  updateTag("catalog");
  await deleteByPrefix("catalog:");
}
