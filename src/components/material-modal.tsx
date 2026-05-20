"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Material, SpecGroup, SpecSelectionLabel } from "@/lib/types";
import { useCart } from "@/lib/cart-context";

type Props = {
  material: Material;
  onClose: () => void;
};

export default function MaterialModal({ material, onClose }: Props) {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const [currentPage, setCurrentPage] = useState(0);

  const specGroups = useMemo<SpecGroup[]>(
    () => material.spec_groups ?? [],
    [material.spec_groups]
  );
  const hasSpecGroups = specGroups.length > 0;

  // 仕様ごとに 1 option を選ぶ。{ [groupId]: optionId | undefined }
  const [selections, setSelections] = useState<Record<string, string | undefined>>({});

  // バリデーション時に未選択グループへスクロール＋ハイライトするための ref / state
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [errorGroupId, setErrorGroupId] = useState<string | null>(null);

  const catalogPages = material.catalog_pages || [];
  const hasMultiplePages = catalogPages.length > 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 仕様は常に必須として扱うので、全 spec_groups が選択済みかチェック
  const allSelected = specGroups.every((g) => selections[g.id]);
  const ctaEnabled = allSelected;

  function selectOption(groupId: string, optionId: string) {
    setSelections((prev) => ({ ...prev, [groupId]: optionId }));
    if (errorGroupId === groupId) setErrorGroupId(null);
  }

  const handleCtaClick = () => {
    if (!allSelected) {
      const firstMissing = specGroups.find((g) => !selections[g.id]);
      if (firstMissing) {
        setErrorGroupId(firstMissing.id);
        groupRefs.current[firstMissing.id]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    const labels: SpecSelectionLabel[] = [];
    for (const g of specGroups) {
      const optId = selections[g.id];
      if (!optId) continue;
      const opt = g.options.find((o) => o.id === optId);
      if (!opt) continue;
      labels.push({
        spec_group_id: g.id,
        group_name: g.name,
        spec_option_id: optId,
        option_label: opt.label,
      });
    }
    addItem({ material, quantity, selections: labels });
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
                    selectedId={selections[g.id]}
                    error={errorGroupId === g.id}
                    onSelect={(optId) => selectOption(g.id, optId)}
                    refCallback={(el) => {
                      groupRefs.current[g.id] = el;
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 固定フッター */}
        <div className="border-t border-border px-5 py-4 bg-surface flex items-center gap-3">
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
          <button
            onClick={handleCtaClick}
            aria-disabled={!ctaEnabled}
            className="flex-1 h-11 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99] inline-flex items-center justify-center gap-2 aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-primary"
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
  selectedId,
  error = false,
  onSelect,
  refCallback,
}: {
  group: SpecGroup;
  selectedId: string | undefined;
  error?: boolean;
  onSelect: (optionId: string) => void;
  refCallback?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={refCallback}
      className={`scroll-mt-4 rounded-lg transition-colors ${
        error
          ? "bg-danger-soft/50 ring-1 ring-danger/40 p-3 -mx-3 motion-safe:animate-[pulse_1.2s_ease-in-out_1]"
          : ""
      }`}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-bold text-foreground">{group.name}</span>
        {error && (
          <span className="text-xs font-medium text-danger">
            選択してください
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {group.options.map((opt) => {
          const selected = selectedId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={`h-12 rounded-lg border text-sm font-semibold transition-colors ${
                selected
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
