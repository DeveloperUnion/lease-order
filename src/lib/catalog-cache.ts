import "server-only";
import { revalidateTag } from "next/cache";
import { deleteByPrefix } from "./redis-cache";

// admin / 顧客側の発注で資材・カテゴリ・営業所・在庫が変わったときに呼ぶ
// catalog 無効化。
//
//   1) Next.js 側: revalidateTag("catalog") で unstable_cache 配下を invalidate
//   2) Redis 側: catalog: prefix の key を全削除
//
// 以前は updateTag を使っていたが、updateTag は Server Action からしか呼べないため
// /api/orders/route.ts (Route Handler) 経由の発注確定でエラーになっていた。
// revalidateTag は Server Action / Route Handler 両方から安全に呼べる。
//
// Redis が未設定なら 2) は no-op で 1) だけ走る。
export async function revalidateCatalog(): Promise<void> {
  revalidateTag("catalog");
  await deleteByPrefix("catalog:");
}
