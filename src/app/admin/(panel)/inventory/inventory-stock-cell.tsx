"use client";

import { useState, useTransition } from "react";

// 在庫数のインライン編集セル。
// 空文字 = 未設定 (null) / 0 = 在庫切れ明示。onBlur と Enter で保存。
// 親 (admin-inventory-view) は server action 完了後に router.refresh() で
// 最新値を再取得する想定。同時編集の追従は考慮しない。
export default function InventoryStockCell({
  value,
  onSave,
  onToast,
  ariaLabel,
}: {
  value: number | null;
  onSave: (next: number | null) => Promise<void>;
  onToast: (msg: string) => void;
  ariaLabel: string;
}) {
  const initial = value === null ? "" : String(value);
  const [draft, setDraft] = useState<string>(initial);
  const [isPending, startTransition] = useTransition();

  const parsed: number | null =
    draft === "" ? null : Math.max(0, Math.floor(Number(draft) || 0));

  const save = () => {
    if (parsed === value) return;
    startTransition(async () => {
      try {
        await onSave(parsed);
        onToast(
          parsed === null ? "在庫を未設定にしました" : "在庫を更新しました"
        );
      } catch (e) {
        onToast(e instanceof Error ? e.message : "更新に失敗しました");
        setDraft(initial);
      }
    });
  };

  return (
    <input
      type="number"
      min={0}
      value={draft}
      placeholder="-"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      disabled={isPending}
      aria-label={ariaLabel}
      title="空欄にすると未設定。0 で在庫切れを明示。"
      className="w-20 h-8 px-2 text-sm text-right tabular-nums bg-surface border border-rule rounded-[var(--radius-sm)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
    />
  );
}
