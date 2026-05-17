import type { SpecSelectionLabel } from "./types";

// 同じ資材で同じ仕様の組み合わせはカートで 1 行として数量加算する。
// その識別用に、materialId + selections の安定ハッシュを cartLineId にする。
export function buildCartLineId(
  materialId: string,
  selections: SpecSelectionLabel[]
): string {
  const sig = [...selections]
    .map((s) => `${s.spec_group_id}=${s.spec_option_id}`)
    .sort()
    .join("|");
  return `${materialId}:${sig || "_"}`;
}
