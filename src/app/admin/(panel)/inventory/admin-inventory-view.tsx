"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InventoryListRow } from "@/lib/admin-data";
import type { Category } from "@/lib/types";
import {
  updateMaterialStock,
  updateSpecOptionStock,
} from "@/app/admin/actions";
import { PageHeader, Select, TextInput } from "@/components/admin/ui";
import StockBreakdown from "@/components/admin/stock-breakdown";
import InventoryStockCell from "./inventory-stock-cell";

type SortKey = "available_asc" | "name" | "category" | "stock_desc";

// 親行が描画すべき集約値（保有/貸出/残/未設定数）
function aggregateRow(row: InventoryListRow): {
  stock: number | null;
  inUse: number;
  available: number | null;
  unconfigured: number;
  hasOutOfStock: boolean;
} {
  if (row.stock.kind === "material") {
    return {
      stock: row.stock.stock,
      inUse: row.stock.in_use,
      available: row.stock.available,
      unconfigured: row.stock.stock === null ? 1 : 0,
      hasOutOfStock:
        row.stock.available !== null && row.stock.available <= 0,
    };
  }
  const opts = row.stock.options;
  const unconfigured = opts.filter((o) => o.stock === null).length;
  const totals = opts.reduce(
    (acc, o) => ({
      stock: acc.stock + (o.stock ?? 0),
      in_use: acc.in_use + o.in_use,
      available: acc.available + (o.available ?? 0),
    }),
    { stock: 0, in_use: 0, available: 0 }
  );
  const hasOutOfStock = opts.some(
    (o) => o.available !== null && o.available <= 0
  );
  return {
    stock: totals.stock,
    inUse: totals.in_use,
    available: totals.available,
    unconfigured,
    hasOutOfStock,
  };
}

export default function AdminInventoryView({
  rows,
  categories,
}: {
  rows: InventoryListRow[];
  categories: Category[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [onlyAlerts, setOnlyAlerts] = useState<boolean>(false);
  const [includeUnset, setIncludeUnset] = useState<boolean>(true);
  const [sortKey, setSortKey] = useState<SortKey>("available_asc");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // 初期展開: 「未設定 or 残≤0 を含む」資材
    const init = new Set<string>();
    for (const r of rows) {
      const agg = aggregateRow(r);
      if (
        r.stock.kind === "spec_options" &&
        (agg.unconfigured > 0 || agg.hasOutOfStock)
      ) {
        init.add(r.material.id);
      }
    }
    return init;
  });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (categoryId && r.material.category?.id !== categoryId) return false;
        if (q && !r.material.name.toLowerCase().includes(q)) return false;
        const agg = aggregateRow(r);
        if (onlyAlerts && !agg.hasOutOfStock) return false;
        if (!includeUnset && agg.stock === null && agg.unconfigured > 0) {
          // 「未設定を含む」OFF のとき、material 単位の未設定は除外。
          // spec_options ありで一部だけ未設定は表示（部分的に設定済なら見せたい）
          if (r.stock.kind === "material") return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "name":
            return a.material.name.localeCompare(b.material.name, "ja");
          case "category":
            return (
              (a.material.category?.name ?? "").localeCompare(
                b.material.category?.name ?? "",
                "ja"
              ) || a.material.name.localeCompare(b.material.name, "ja")
            );
          case "stock_desc": {
            const sa = aggregateRow(a).stock ?? -1;
            const sb = aggregateRow(b).stock ?? -1;
            return sb - sa;
          }
          case "available_asc":
          default: {
            // 残少順: null は最後
            const aa = aggregateRow(a).available;
            const bb = aggregateRow(b).available;
            if (aa === null && bb === null) return 0;
            if (aa === null) return 1;
            if (bb === null) return -1;
            return aa - bb;
          }
        }
      });
  }, [rows, categoryId, search, onlyAlerts, includeUnset, sortKey]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveMaterial = async (
    materialId: string,
    next: number | null
  ) => {
    await updateMaterialStock(materialId, next);
    router.refresh();
  };

  const handleSaveSpecOption = async (
    materialId: string,
    groupId: string,
    optionId: string,
    next: number | null
  ) => {
    await updateSpecOptionStock(materialId, groupId, optionId, next);
    router.refresh();
  };

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="在庫管理"
        description="資材の保有数・貸出中・残数を一覧で確認・編集できます。空欄＝未設定 / 0＝在庫切れ明示。"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-subtle mb-1">カテゴリ</label>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-w-[160px]"
          >
            <option value="">全て</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-subtle mb-1">検索</label>
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="資材名で絞り込み"
          />
        </div>
        <div>
          <label className="block text-xs text-subtle mb-1">並び順</label>
          <Select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="available_asc">残少順</option>
            <option value="stock_desc">保有多い順</option>
            <option value="name">資材名</option>
            <option value="category">カテゴリ</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground select-none h-10">
          <input
            type="checkbox"
            checked={onlyAlerts}
            onChange={(e) => setOnlyAlerts(e.target.checked)}
            className="accent-accent"
          />
          在庫切れのみ
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground select-none h-10">
          <input
            type="checkbox"
            checked={includeUnset}
            onChange={(e) => setIncludeUnset(e.target.checked)}
            className="accent-accent"
          />
          未設定を含む
        </label>
        <p className="ml-auto text-xs text-subtle tabular-nums self-end pb-2">
          {filtered.length} / {rows.length} 件
        </p>
      </div>

      <div className="border-y border-rule">
        {/* ヘッダー行 */}
        <div className="grid grid-cols-[2.5rem_3rem_minmax(0,1fr)_8rem_5.5rem_4.5rem_6rem_7rem] items-center px-3 py-3 text-xs text-muted font-medium bg-surface-muted border-b border-rule">
          <span aria-hidden />
          <span aria-hidden />
          <span>資材名</span>
          <span>カテゴリ</span>
          <span className="text-right">保有</span>
          <span className="text-right">貸出</span>
          <span className="text-right">残</span>
          <span className="text-right">状態</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-subtle">
            該当する資材がありません
          </div>
        ) : (
          <div className="divide-y divide-rule">
            {filtered.map((row) => {
              const agg = aggregateRow(row);
              const isSpec = row.stock.kind === "spec_options";
              const isOpen = expanded.has(row.material.id);
              // border は「在庫切れ」だけを強く示す。未設定は右側のバッジに任せる
              // （未設定が多発するとべったり茶色が並んで一覧性を損なうため）
              const borderColor =
                agg.hasOutOfStock
                  ? "border-l-[var(--color-status-rejected-fg)]"
                  : "border-l-transparent";

              return (
                <div key={row.material.id}>
                  <div
                    className={`grid grid-cols-[2.5rem_3rem_minmax(0,1fr)_8rem_5.5rem_4.5rem_6rem_7rem] items-center px-3 py-3 border-l-4 ${borderColor} hover:bg-surface-muted/40 transition-colors`}
                  >
                    {/* 展開トグル */}
                    <div className="flex items-center justify-center">
                      {isSpec ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(row.material.id)}
                          className="text-subtle hover:text-foreground transition-colors w-6 h-6 flex items-center justify-center"
                          aria-label={isOpen ? "閉じる" : "展開"}
                        >
                          <span className="text-xs">{isOpen ? "▼" : "▶"}</span>
                        </button>
                      ) : null}
                    </div>
                    {/* サムネ */}
                    <div className="w-10 h-10 bg-surface-muted overflow-hidden flex-shrink-0">
                      {row.material.image_url ? (
                        <Image
                          src={row.material.image_url}
                          alt=""
                          width={40}
                          height={40}
                          className="w-full h-full object-contain"
                          unoptimized={row.material.image_url.endsWith(".svg")}
                        />
                      ) : null}
                    </div>
                    {/* 資材名 */}
                    <div className="min-w-0 pr-3">
                      <a
                        href={`/admin/materials/${row.material.id}`}
                        className="text-sm text-foreground hover:text-accent truncate block"
                      >
                        {row.material.name}
                      </a>
                    </div>
                    {/* カテゴリ */}
                    <div className="text-xs text-subtle truncate">
                      {row.material.category?.name ?? "—"}
                    </div>
                    {/* 保有 */}
                    <div className="flex justify-end pr-1">
                      {isSpec ? (
                        <span className="text-sm text-subtle tabular-nums">
                          {agg.stock}
                        </span>
                      ) : (
                        <InventoryStockCell
                          value={row.stock.kind === "material" ? row.stock.stock : null}
                          onSave={(next) =>
                            handleSaveMaterial(row.material.id, next)
                          }
                          onToast={showToast}
                          ariaLabel={`${row.material.name} の在庫`}
                        />
                      )}
                    </div>
                    {/* 貸出 */}
                    <div className="text-right text-sm text-subtle tabular-nums">
                      {agg.inUse}
                    </div>
                    {/* 残 */}
                    <div className="text-right text-sm tabular-nums">
                      <span
                        className={
                          agg.available === null
                            ? "text-subtle"
                            : agg.available <= 0
                            ? "text-[var(--color-status-rejected-fg)] font-semibold"
                            : "text-foreground font-semibold"
                        }
                      >
                        {agg.available === null ? "-" : agg.available}
                      </span>
                    </div>
                    {/* 状態 */}
                    <div className="text-right">
                      <StatusChips
                        outOfStock={agg.hasOutOfStock}
                        unconfigured={agg.unconfigured}
                        isMaterialUnset={
                          row.stock.kind === "material" &&
                          row.stock.stock === null
                        }
                      />
                    </div>
                  </div>

                  {/* spec_options の子行 */}
                  {isSpec && isOpen && row.stock.kind === "spec_options" && (
                    <div className="bg-surface-muted/30 border-t border-rule">
                      {row.spec_groups.flatMap((g) =>
                        g.options.map((opt) => {
                          const s = (row.stock.kind === "spec_options"
                            ? row.stock.options
                            : []
                          ).find((x) => x.spec_option_id === opt.id);
                          if (!s) return null;
                          const childBorder =
                            s.available !== null && s.available <= 0
                              ? "border-l-[var(--color-status-rejected-fg)]"
                              : "border-l-transparent";
                          return (
                            <div
                              key={opt.id}
                              className={`grid grid-cols-[2.5rem_3rem_minmax(0,1fr)_8rem_5.5rem_4.5rem_6rem_7rem] items-center px-3 py-2 border-l-4 ${childBorder}`}
                            >
                              <span aria-hidden />
                              <span aria-hidden />
                              <div className="text-xs text-muted truncate pl-6">
                                <span className="text-subtle">└</span>{" "}
                                {g.name}: {opt.label}
                              </div>
                              <div aria-hidden />
                              <div className="flex justify-end pr-1">
                                <InventoryStockCell
                                  value={s.stock}
                                  onSave={(next) =>
                                    handleSaveSpecOption(
                                      row.material.id,
                                      g.id,
                                      opt.id,
                                      next
                                    )
                                  }
                                  onToast={showToast}
                                  ariaLabel={`${row.material.name} ${g.name} ${opt.label} の在庫`}
                                />
                              </div>
                              <div className="text-right text-sm text-subtle tabular-nums">
                                {s.in_use}
                              </div>
                              <div className="text-right text-sm tabular-nums">
                                <span
                                  className={
                                    s.available === null
                                      ? "text-subtle"
                                      : s.available <= 0
                                      ? "text-[var(--color-status-rejected-fg)] font-semibold"
                                      : "text-foreground font-semibold"
                                  }
                                >
                                  {s.available === null ? "-" : s.available}
                                </span>
                              </div>
                              <div className="text-right">
                                <StatusChips
                                  outOfStock={
                                    s.available !== null && s.available <= 0
                                  }
                                  unconfigured={s.stock === null ? 1 : 0}
                                  isMaterialUnset={s.stock === null}
                                  compact
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div className="px-3 py-2 text-[11px] text-subtle border-t border-rule">
                        <StockBreakdown
                          stock={agg.stock}
                          inUse={agg.inUse}
                          available={agg.available}
                          compact
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background px-4 py-2 text-sm font-[family-name:var(--font-mono)] tracking-tight shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    </main>
  );
}

function StatusChips({
  outOfStock,
  unconfigured,
  isMaterialUnset,
  compact = false,
}: {
  outOfStock: boolean;
  unconfigured: number;
  isMaterialUnset: boolean;
  compact?: boolean;
}) {
  const baseClass = compact
    ? "text-[10px] px-1.5 py-0.5"
    : "text-[11px] px-2 py-0.5";
  return (
    <div className="inline-flex flex-wrap items-center gap-1 justify-end">
      {outOfStock && (
        <span
          className={`${baseClass} bg-[var(--color-status-rejected-bg)] text-[var(--color-status-rejected-fg)] font-[family-name:var(--font-mono)] uppercase tracking-wider`}
        >
          在庫切
        </span>
      )}
      {isMaterialUnset ? (
        <span
          className={`${baseClass} bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)] font-[family-name:var(--font-mono)] uppercase tracking-wider`}
        >
          未設定
        </span>
      ) : unconfigured > 0 ? (
        <span
          className={`${baseClass} bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)] font-[family-name:var(--font-mono)] uppercase tracking-wider`}
        >
          未設定 {unconfigured}
        </span>
      ) : null}
    </div>
  );
}
