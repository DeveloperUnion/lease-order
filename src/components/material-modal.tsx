"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Material, SpecGroup, SpecSelectionLabel, VariantOptionRef } from "@/lib/types";
import { useCart } from "@/lib/cart-context";
import { resolveVariant } from "@/lib/spec-resolver";

type Props = {
  material: Material;
  onClose: () => void;
};

type AddItemInput = {
  material: Material;
  quantity: number;
  variantId?: string;
  variantName?: string;
  selections?: SpecSelectionLabel[];
};

export default function MaterialModal({ material, onClose }: Props) {
  const [quantity, setQuantity] = useState(1);
  const { addItem, addItems } = useCart();
  const [currentPage, setCurrentPage] = useState(0);

  const specGroups = useMemo<SpecGroup[]>(
    () => (material.spec_groups ?? []).filter((g) => g.is_active),
    [material.spec_groups]
  );
  const singleGroups = useMemo(
    () => specGroups.filter((g) => g.selection_type === "single"),
    [specGroups]
  );
  const multiGroups = useMemo(
    () => specGroups.filter((g) => g.selection_type === "multi"),
    [specGroups]
  );
  const hasSpecGroups = specGroups.length > 0;

  // single 軸：groupId -> optionId
  const [singleSelections, setSingleSelections] = useState<
    Record<string, string | undefined>
  >({});
  // multi 軸：groupId -> { optionId -> qty }
  const [multiQuantities, setMultiQuantities] = useState<
    Record<string, Record<string, number>>
  >({});
  const [error, setError] = useState<string | null>(null);

  const catalogPages = material.catalog_pages || [];
  const hasMultiplePages = catalogPages.length > 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allSingleSelected = singleGroups.every((g) => singleSelections[g.id]);
  const someMultiHasQty =
    multiGroups.length === 0 ||
    multiGroups.some((g) =>
      Object.values(multiQuantities[g.id] ?? {}).some((q) => q > 0)
    );
  const ctaEnabled = !hasSpecGroups || (allSingleSelected && someMultiHasQty);

  function selectSingle(groupId: string, optionId: string) {
    setError(null);
    setSingleSelections((prev) => ({ ...prev, [groupId]: optionId }));
  }

  function setMultiQty(groupId: string, optionId: string, qty: number) {
    setError(null);
    setMultiQuantities((prev) => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? {}), [optionId]: Math.max(0, qty) },
    }));
  }

  function toggleMulti(groupId: string, optionId: string) {
    const current = multiQuantities[groupId]?.[optionId] ?? 0;
    setMultiQty(groupId, optionId, current > 0 ? 0 : 1);
  }

  const handleAdd = () => {
    if (!hasSpecGroups) {
      addItem({ material, quantity });
      onClose();
      return;
    }

    const baseRefs: VariantOptionRef[] = singleGroups.map((g) => ({
      spec_group_id: g.id,
      spec_option_id: singleSelections[g.id]!,
    }));
    const baseLabels: SpecSelectionLabel[] = singleGroups.map((g) => {
      const optId = singleSelections[g.id]!;
      const opt = g.options.find((o) => o.id === optId)!;
      return {
        spec_group_id: g.id,
        group_name: g.name,
        spec_option_id: optId,
        option_label: opt.label,
      };
    });

    if (multiGroups.length === 0) {
      const variant = resolveVariant(material.variants ?? [], baseRefs);
      if (!variant) {
        setError("この組み合わせの在庫がありません");
        return;
      }
      addItem({
        material,
        quantity,
        variantId: variant.id,
        variantName: variant.name,
        selections: baseLabels,
      });
      onClose();
      return;
    }

    // multi 軸：v1 は 1 つを想定。複数ある場合、最初を展開軸として qty を分配。
    const expandGroup = multiGroups[0];
    const otherMulti = multiGroups.slice(1);
    const otherRefs: VariantOptionRef[] = [];
    const otherLabels: SpecSelectionLabel[] = [];
    for (const og of otherMulti) {
      const ent = Object.entries(multiQuantities[og.id] ?? {}).find(
        ([, q]) => q > 0
      );
      if (!ent) continue;
      const opt = og.options.find((o) => o.id === ent[0]);
      if (!opt) continue;
      otherRefs.push({ spec_group_id: og.id, spec_option_id: ent[0] });
      otherLabels.push({
        spec_group_id: og.id,
        group_name: og.name,
        spec_option_id: ent[0],
        option_label: opt.label,
      });
    }

    const items: AddItemInput[] = [];
    const missing: string[] = [];
    for (const [optId, qty] of Object.entries(
      multiQuantities[expandGroup.id] ?? {}
    )) {
      if (qty <= 0) continue;
      const opt = expandGroup.options.find((o) => o.id === optId);
      if (!opt) continue;
      const refs: VariantOptionRef[] = [
        ...baseRefs,
        { spec_group_id: expandGroup.id, spec_option_id: optId },
        ...otherRefs,
      ];
      const variant = resolveVariant(material.variants ?? [], refs);
      if (!variant) {
        missing.push(opt.label);
        continue;
      }
      items.push({
        material,
        quantity: qty,
        variantId: variant.id,
        variantName: variant.name,
        selections: [
          ...baseLabels,
          {
            spec_group_id: expandGroup.id,
            group_name: expandGroup.name,
            spec_option_id: optId,
            option_label: opt.label,
          },
          ...otherLabels,
        ],
      });
    }

    if (missing.length > 0) {
      setError(`次の組み合わせは在庫がありません: ${missing.join("、")}`);
      return;
    }
    if (items.length === 0) {
      setError("最低 1 つ選択してください");
      return;
    }
    addItems(items);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-modal-title"
        className="bg-surface w-full sm:max-w-xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl border border-border motion-safe:animate-[reveal-up_240ms_ease-out_both]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-b border-border bg-surface">
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted hover:bg-surface-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* スクロール領域 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* カタログページ画像 */}
          {catalogPages.length > 0 ? (
            <div className="relative bg-surface-muted">
              <div className="relative w-full mx-auto max-w-md" style={{ aspectRatio: "210/297" }}>
                <Image
                  src={catalogPages[currentPage]}
                  alt={`${material.name} - ページ ${currentPage + 1}`}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 100vw, 512px"
                />
              </div>
              {hasMultiplePages && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface border border-border rounded-full shadow-sm">
                  <button
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    aria-label="前のページ"
                    className="h-8 w-8 inline-flex items-center justify-center text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="text-xs font-medium text-foreground px-1.5 min-w-[56px] text-center tabular-nums">
                    {currentPage + 1} / {catalogPages.length}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(catalogPages.length - 1, currentPage + 1))}
                    disabled={currentPage === catalogPages.length - 1}
                    aria-label="次のページ"
                    className="h-8 w-8 inline-flex items-center justify-center text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full aspect-[3/2] bg-surface-muted flex items-center justify-center">
              <span className="text-sm text-subtle">画像なし</span>
            </div>
          )}

          {/* テキスト詳細 */}
          <div className="px-5 py-5 border-t border-border">
            <h2 id="material-modal-title" className="text-lg font-bold text-foreground leading-snug">
              {material.name}
            </h2>
            {material.description && (
              <p className="text-sm text-muted mt-1.5 leading-relaxed">{material.description}</p>
            )}
            {material.spec && Object.keys(material.spec).length > 0 && (
              <dl className="mt-5 border-t border-border">
                {Object.entries(material.spec).map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-4 py-2 border-b border-border">
                    <dt className="text-xs text-subtle min-w-[7rem]">
                      {key}
                    </dt>
                    <dd className="text-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* 仕様選択 */}
          {hasSpecGroups && (
            <div className="px-5 pb-5">
              <div className="rounded-xl border border-brand/40 p-4 space-y-5">
                <h3 className="text-sm font-bold text-foreground">仕様選択</h3>
                {specGroups.map((g) => (
                  <SpecGroupBlock
                    key={g.id}
                    group={g}
                    singleValue={singleSelections[g.id]}
                    multiValue={multiQuantities[g.id] ?? {}}
                    onSelectSingle={(optId) => selectSingle(g.id, optId)}
                    onToggleMulti={(optId) => toggleMulti(g.id, optId)}
                    onSetMultiQty={(optId, qty) => setMultiQty(g.id, optId, qty)}
                  />
                ))}
                {error && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 固定フッター */}
        <div className="border-t border-border px-5 py-4 bg-surface flex items-center gap-3">
          {/* spec_groups あり＆ multi 軸ありの場合は数量入力欄を隠す（各 option に qty 入力欄があるため） */}
          {(!hasSpecGroups || multiGroups.length === 0) && (
            <div className="inline-flex items-stretch border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                aria-label="数量を減らす"
                className="w-11 inline-flex items-center justify-center text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M5 12h14" /></svg>
              </button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                aria-label="数量"
                className="w-14 text-center text-sm font-semibold text-foreground border-x border-border h-11 bg-surface tabular-nums focus:outline-none focus:bg-accent-soft"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                aria-label="数量を増やす"
                className="w-11 inline-flex items-center justify-center text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={!ctaEnabled}
            className="flex-1 h-11 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99] inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            カートに追加
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecGroupBlock({
  group,
  singleValue,
  multiValue,
  onSelectSingle,
  onToggleMulti,
  onSetMultiQty,
}: {
  group: SpecGroup;
  singleValue: string | undefined;
  multiValue: Record<string, number>;
  onSelectSingle: (optionId: string) => void;
  onToggleMulti: (optionId: string) => void;
  onSetMultiQty: (optionId: string, qty: number) => void;
}) {
  const options = group.options.filter((o) => o.is_active);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-foreground">{group.name}</span>
        {group.selection_type === "multi" && (
          <span className="text-[10px] font-semibold text-brand bg-brand/10 px-1.5 py-0.5 rounded">
            複数選択可
          </span>
        )}
        {group.is_required && (
          <span className="text-[10px] font-semibold text-white bg-rose-500 px-1.5 py-0.5 rounded">
            必須
          </span>
        )}
        {group.selection_type === "single" && !group.is_required && (
          <span className="text-[10px] font-semibold text-muted bg-surface-muted px-1.5 py-0.5 rounded">
            単一選択
          </span>
        )}
      </div>
      {group.description && (
        <p className="text-xs text-muted mb-2">{group.description}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          if (group.selection_type === "single") {
            const selected = singleValue === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectSingle(opt.id)}
                className={`h-12 rounded-lg border text-sm font-semibold transition-colors ${
                  selected
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border bg-surface text-foreground hover:bg-surface-muted"
                }`}
              >
                {opt.label}
              </button>
            );
          }
          const qty = multiValue[opt.id] ?? 0;
          const selected = qty > 0;
          return (
            <div
              key={opt.id}
              className={`rounded-lg border p-2 transition-colors ${
                selected ? "border-brand bg-brand/10" : "border-border bg-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleMulti(opt.id)}
                className={`w-full text-left text-sm font-semibold ${
                  selected ? "text-brand" : "text-foreground"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                      selected ? "border-brand bg-brand text-white" : "border-border bg-surface"
                    }`}
                  >
                    {selected && (
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4L8.5 12 15.3 5.3a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </span>
              </button>
              {selected && (
                <div className="mt-2 inline-flex items-stretch border border-border rounded-md overflow-hidden bg-surface">
                  <button
                    type="button"
                    onClick={() => onSetMultiQty(opt.id, Math.max(1, qty - 1))}
                    aria-label="数量を減らす"
                    className="w-8 h-8 inline-flex items-center justify-center text-muted hover:bg-surface-muted"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) =>
                      onSetMultiQty(opt.id, Math.max(1, Number(e.target.value)))
                    }
                    aria-label={`${opt.label} の数量`}
                    className="w-12 text-center text-sm font-semibold text-foreground border-x border-border h-8 bg-surface tabular-nums focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onSetMultiQty(opt.id, qty + 1)}
                    aria-label="数量を増やす"
                    className="w-8 h-8 inline-flex items-center justify-center text-muted hover:bg-surface-muted"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
