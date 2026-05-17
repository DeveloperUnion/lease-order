import type {
  MaterialVariantWithOptions,
  VariantOptionRef,
} from "./types";

export function buildCartLineId(materialId: string, variantId?: string): string {
  return `${materialId}:${variantId ?? "_"}`;
}

export function resolveVariant(
  variants: MaterialVariantWithOptions[],
  selections: VariantOptionRef[]
): MaterialVariantWithOptions | null {
  if (selections.length === 0) return null;
  const selectionKey = toKey(selections);
  for (const v of variants) {
    if (!v.is_active) continue;
    if (v.options.length !== selections.length) continue;
    if (toKey(v.options) === selectionKey) return v;
  }
  return null;
}

function toKey(refs: VariantOptionRef[]): string {
  return [...refs]
    .map((r) => `${r.spec_group_id}=${r.spec_option_id}`)
    .sort()
    .join("|");
}
