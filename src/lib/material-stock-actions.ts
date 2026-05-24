"use server";

import { getMaterialStockSummary } from "@/lib/admin-data";
import type { MaterialStockSummary } from "@/lib/types";

// 発注モーダルから呼ぶ「現在の在庫サマリ」取得。
// 内部実装は admin と同じ派生計算（RLS で tenant 分離されるので customer 側
// から呼んでも自テナントの在庫しか取れない）。
export async function fetchMaterialStock(
  materialId: string
): Promise<MaterialStockSummary> {
  return getMaterialStockSummary(materialId);
}
