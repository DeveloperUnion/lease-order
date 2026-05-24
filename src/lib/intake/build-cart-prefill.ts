import type { CartItem, Material, SpecSelectionLabel } from "@/lib/types";
import { buildCartLineId } from "@/lib/spec-resolver";
import type { ResolvedIntake, ResolvedIntakeItem } from "./types";

// intake 編集 UI で人が確定した 1 行の状態。
export type IntakeEditorRow = {
  raw: ResolvedIntakeItem;
  // ユーザが選択（or AI 解決）した material。null なら未確定でカート投入不可。
  material: Material | null;
  // material の必須 spec_group ぶん選択した SpecSelectionLabel[]。
  selections: SpecSelectionLabel[];
  quantity: number;
};

export type CartPrefill = {
  items: CartItem[];
  formFields: ResolvedIntake["form_fields"];
};

// IntakeEditorRow[] → CartItem[]。material が null の行は除外する。
// 必須 spec_group すべて選択されている前提（UI 側で enforce）。
export function buildCartPrefill(
  rows: IntakeEditorRow[],
  formFields: ResolvedIntake["form_fields"]
): CartPrefill {
  const items: CartItem[] = [];
  for (const row of rows) {
    if (!row.material) continue;
    const quantity = Math.max(1, Math.floor(row.quantity || 0));
    items.push({
      cartLineId: buildCartLineId(row.material.id, row.selections),
      material: row.material,
      quantity,
      selections: row.selections,
    });
  }
  return { items, formFields };
}

// AI が出した spec_hints (group_name, option_label の文字列) を、
// Material が実際に持つ spec_groups/options に当てて SpecSelectionLabel[] に変換する。
// 一致しないものは捨てる（ユーザが UI で再選択する）。
export function matchSpecHints(
  material: Material,
  hints: { group_name: string; option_label: string }[]
): SpecSelectionLabel[] {
  if (!material.spec_groups?.length) return [];
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[　\s]+/g, "").replace(/[（）()【】\[\]「」]/g, "");

  const out: SpecSelectionLabel[] = [];
  for (const group of material.spec_groups) {
    const gNorm = normalize(group.name);
    const hint = hints.find(
      (h) => normalize(h.group_name) === gNorm || normalize(h.group_name).includes(gNorm)
    );
    if (!hint) continue;
    const oNorm = normalize(hint.option_label);
    const opt = group.options.find((o) => {
      const on = normalize(o.label);
      return on === oNorm || on.includes(oNorm) || oNorm.includes(on);
    });
    if (!opt) continue;
    out.push({
      spec_group_id: group.id,
      group_name: group.name,
      spec_option_id: opt.id,
      option_label: opt.label,
    });
  }
  return out;
}

// material_id を引いて全部一気に Material オブジェクトに化す前段。
// 与えられた material_id について必要なフィールドが揃っているかを判定する
// （フォーム送信前の最終チェック）。
export function isRowComplete(row: IntakeEditorRow): boolean {
  if (!row.material) return false;
  if (row.quantity < 1) return false;
  const required = row.material.spec_groups ?? [];
  for (const g of required) {
    if (!row.selections.some((s) => s.spec_group_id === g.id)) return false;
  }
  return true;
}
