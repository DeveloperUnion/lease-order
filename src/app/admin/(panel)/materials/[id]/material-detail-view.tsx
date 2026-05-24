"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition } from "react";
import type {
  AdminCategoryRow,
  MaterialDetail,
  MaterialImageRow,
} from "@/lib/admin-data";
import type {
  MaterialStockSummary,
  SpecGroup,
  SpecOption,
  SpecOptionStock,
} from "@/lib/types";
import {
  addMaterialImage,
  createSpecGroupWithOptions,
  createSpecOption,
  deleteSpecGroup,
  deleteSpecOption,
  removeMaterialImage,
  reorderMaterialImages,
  reorderSpecGroups,
  reorderSpecOptions,
  setMaterialActive,
  setPrimaryMaterialImage,
  updateMaterial,
  updateMaterialStock,
  updateSpecGroup,
  updateSpecOption,
  updateSpecOptionStock,
} from "@/app/admin/actions";
import {
  PageHeader,
  SectionRule,
  Button,
  FormField,
  TextInput,
  TextArea,
  Select,
} from "@/components/admin/ui";
import { resizeImage } from "@/lib/image/resize-client";

const MAX_IMAGES = 5;

export default function MaterialDetailView({
  material,
  categories,
  stock,
}: {
  material: MaterialDetail;
  categories: AdminCategoryRow[];
  stock: MaterialStockSummary;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <>
      <PageHeader
        backHref="/admin/materials"
        backLabel="資材マスタに戻る"
        title={material.name}
        actions={<ActiveToggle material={material} onToast={showToast} />}
      />

      <div className="space-y-10">
        <BasicInfoSection
          material={material}
          categories={categories}
          onToast={showToast}
        />
        <ImagesSection material={material} onToast={showToast} />
        <StockSection material={material} stock={stock} onToast={showToast} />
        <SpecGroupsSection material={material} stock={stock} onToast={showToast} />
      </div>

      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] pointer-events-none">
          <div className="bg-surface border border-rule-strong shadow-2xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="w-10 h-10 bg-foreground flex items-center justify-center">
              <svg
                className="h-5 w-5 text-background"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">{toast}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Active toggle (top-right)
// ============================================================

function ActiveToggle({
  material,
  onToast,
}: {
  material: MaterialDetail;
  onToast: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const handleToggle = () => {
    startTransition(async () => {
      try {
        await setMaterialActive(material.id, !material.is_active);
        onToast(material.is_active ? "非公開にしました" : "公開しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  };
  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
        material.is_active
          ? "bg-[var(--color-status-completed-bg)] text-[var(--color-status-completed-fg)] border border-[var(--color-status-completed-fg)]/20 hover:bg-[var(--color-status-completed-fg)]/10"
          : "bg-surface-muted text-muted border border-rule hover:bg-rule"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          material.is_active ? "bg-[var(--color-status-completed-fg)]" : "bg-subtle"
        }`}
      />
      <span className="font-medium">
        {material.is_active ? "公開中" : "非公開"}
      </span>
    </button>
  );
}

// ============================================================
// Basic info section
// ============================================================

function BasicInfoSection({
  material,
  categories,
  onToast,
}: {
  material: MaterialDetail;
  categories: AdminCategoryRow[];
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState(material.name);
  const [categoryId, setCategoryId] = useState(material.category_id);
  const [description, setDescription] = useState(material.description ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== material.name ||
    categoryId !== material.category_id ||
    (description ?? "") !== (material.description ?? "");

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("category_id", categoryId);
      fd.set("description", description);
      fd.set("is_active", material.is_active ? "true" : "false");
      try {
        await updateMaterial(material.id, fd);
        onToast("更新しました");
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  return (
    <section>
      <SectionRule label="基本情報" className="mb-4" />
      <div className="space-y-4">
        <FormField label="資材名" htmlFor="material-name" required>
          <TextInput
            id="material-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FormField>
        <FormField label="カテゴリ" htmlFor="material-cat">
          <Select
            id="material-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="説明" htmlFor="material-desc">
          <TextArea
            id="material-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </FormField>
        {error && (
          <p className="text-sm text-[var(--color-status-rejected-fg)]">{error}</p>
        )}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!dirty || !name.trim() || isPending}
          >
            {isPending ? "保存中…" : "基本情報を保存"}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Images section (max 5, drag&drop reorder)
// ============================================================

function ImagesSection({
  material,
  onToast,
}: {
  material: MaterialDetail;
  onToast: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState<MaterialImageRow[]>(material.images);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (
    material.images.length !== order.length ||
    material.images.some((img, i) => order[i]?.image_id !== img.image_id)
  ) {
    const serverIds = new Set(material.images.map((i) => i.image_id));
    const localIds = new Set(order.map((i) => i.image_id));
    const sameSet =
      serverIds.size === localIds.size &&
      [...serverIds].every((id) => localIds.has(id));
    if (!sameSet) {
      setOrder(material.images);
    }
  }

  const handleAdd = (file: File) => {
    if (order.length >= MAX_IMAGES) {
      onToast(`画像は最大${MAX_IMAGES}枚までです`);
      return;
    }
    startTransition(async () => {
      const resized = await resizeImage(file, { maxEdge: 1200, quality: 0.85 });
      const fd = new FormData();
      fd.set("image", resized);
      try {
        await addMaterialImage(material.id, fd);
        onToast("画像を追加しました");
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        onToast(e instanceof Error ? e.message : "追加に失敗しました");
      }
    });
  };

  const handleDelete = (imageId: string) => {
    if (!confirm("この画像を削除しますか？")) return;
    startTransition(async () => {
      try {
        await removeMaterialImage(material.id, imageId);
        onToast("削除しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  const handleSetPrimary = (imageId: string) => {
    startTransition(async () => {
      try {
        await setPrimaryMaterialImage(material.id, imageId);
        onToast("代表画像を変更しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const fromIdx = next.findIndex((i) => i.image_id === dragId);
    const toIdx = next.findIndex((i) => i.image_id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setOrder(next);
    setDragId(null);
    startTransition(async () => {
      try {
        await reorderMaterialImages(
          material.id,
          next.map((i) => i.image_id)
        );
      } catch (e) {
        onToast(e instanceof Error ? e.message : "並び替えに失敗しました");
        setOrder(material.images);
      }
    });
  };

  return (
    <section>
      <SectionRule
        label="画像"
        right={
          <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle">
            {order.length} / {MAX_IMAGES}
          </span>
        }
        className="mb-4"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {order.map((img) => (
          <div
            key={img.image_id}
            draggable
            onDragStart={() => setDragId(img.image_id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(img.image_id)}
            className={`group relative aspect-square bg-surface-muted overflow-hidden border ${
              img.is_primary ? "border-accent border-2" : "border-rule"
            } ${dragId === img.image_id ? "opacity-50" : ""}`}
          >
            <Image
              src={img.url}
              alt=""
              fill
              sizes="(min-width: 768px) 20vw, (min-width: 640px) 33vw, 50vw"
              className="object-contain pointer-events-none"
              unoptimized={img.url.endsWith(".svg")}
            />
            {img.is_primary && (
              <span className="absolute top-1 left-1 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wider bg-accent text-white px-1.5 py-0.5">
                代表
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-foreground/80 text-background text-[10px] flex divide-x divide-background/20 opacity-0 group-hover:opacity-100 transition-opacity">
              {!img.is_primary && (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(img.image_id)}
                  disabled={isPending}
                  className="flex-1 py-1.5 hover:bg-background/10 disabled:opacity-50 font-[family-name:var(--font-mono)] uppercase tracking-wider"
                >
                  代表に
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(img.image_id)}
                disabled={isPending}
                className="flex-1 py-1.5 hover:bg-background/10 disabled:opacity-50 font-[family-name:var(--font-mono)] uppercase tracking-wider"
              >
                削除
              </button>
            </div>
          </div>
        ))}
        {order.length < MAX_IMAGES && (
          <label
            className={`aspect-square border-2 border-dashed border-rule flex flex-col items-center justify-center text-subtle text-xs gap-1 cursor-pointer hover:border-rule-strong hover:bg-surface-muted transition-colors ${
              isPending ? "opacity-50 cursor-wait" : ""
            }`}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider">
              画像を追加
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAdd(f);
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-3 text-xs text-subtle">
        画像をドラッグで並び替え。カードをクリック → 代表に / 削除。
      </p>
    </section>
  );
}

// ============================================================
// Stock section
//
// 仕様グループが無い資材は資材直下の在庫を編集。仕様グループがあれば
// 在庫は各選択肢（spec_option）で管理する旨を案内し、合計値を出す。
// ============================================================

function StockSection({
  material,
  stock,
  onToast,
}: {
  material: MaterialDetail;
  stock: MaterialStockSummary;
  onToast: (msg: string) => void;
}) {
  return (
    <section>
      <SectionRule label="在庫" className="mb-4" />
      {stock.kind === "material" ? (
        <MaterialStockEditor
          materialId={material.id}
          summary={stock}
          onToast={onToast}
        />
      ) : (
        <SpecOptionStockOverview options={stock.options} />
      )}
    </section>
  );
}

function MaterialStockEditor({
  materialId,
  summary,
  onToast,
}: {
  materialId: string;
  summary: { stock: number | null; in_use: number; available: number | null };
  onToast: (msg: string) => void;
}) {
  // 空文字 = 未設定（null）を表現。stock_quantity が null なら入力欄は空。
  const initial = summary.stock === null ? "" : String(summary.stock);
  const [value, setValue] = useState<string>(initial);
  const [isPending, startTransition] = useTransition();
  const parsed: number | null =
    value === "" ? null : Math.max(0, Math.floor(Number(value) || 0));
  const dirty = parsed !== summary.stock;
  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateMaterialStock(materialId, parsed);
        onToast(
          parsed === null ? "在庫を未設定にしました" : "在庫を更新しました"
        );
      } catch (e) {
        onToast(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  };
  return (
    <div className="flex flex-wrap items-end gap-6">
      <FormField
        label="保有数（マスタ）"
        htmlFor="material-stock"
        hint="空にすると「未設定」になります。0 を入力すると明示的に在庫切れになります。"
      >
        <div className="flex items-center gap-2">
          <TextInput
            id="material-stock"
            type="number"
            min={0}
            value={value}
            placeholder="未設定"
            onChange={(e) => setValue(e.target.value)}
            className="w-28 tabular-nums"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || isPending}
          >
            {isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      </FormField>
      <StockBreakdown
        stock={summary.stock}
        inUse={summary.in_use}
        available={summary.available}
      />
    </div>
  );
}

function SpecOptionStockOverview({
  options,
}: {
  options: SpecOptionStock[];
}) {
  // null （未設定）は集計から除外。「未設定 N 件」を別途併記する。
  const unconfigured = options.filter((o) => o.stock === null).length;
  const totals = options.reduce(
    (acc, o) => ({
      stock: acc.stock + (o.stock ?? 0),
      in_use: acc.in_use + o.in_use,
      available: acc.available + (o.available ?? 0),
    }),
    { stock: 0, in_use: 0, available: 0 }
  );
  return (
    <div className="flex flex-wrap items-center gap-6">
      <p className="text-sm text-muted">
        この資材は仕様で在庫を管理します。下の「仕様」セクションの各選択肢で在庫数を入力してください。
      </p>
      <div className="flex items-center gap-3">
        <StockBreakdown
          stock={totals.stock}
          inUse={totals.in_use}
          available={totals.available}
          compact
        />
        {unconfigured > 0 && (
          <span className="text-xs text-subtle tabular-nums">
            未設定 {unconfigured} 件
          </span>
        )}
      </div>
    </div>
  );
}

function StockBreakdown({
  stock,
  inUse,
  available,
  compact = false,
}: {
  stock: number | null;
  inUse: number;
  available: number | null;
  compact?: boolean;
}) {
  const stockLabel = stock === null ? "-" : String(stock);
  const availableIsOut = available !== null && available <= 0;
  return (
    <div
      className={`flex items-center gap-4 ${
        compact ? "text-xs" : "text-sm"
      } tabular-nums`}
    >
      <span className="text-subtle">保有 {stockLabel}</span>
      <span className="text-subtle">貸出中 {inUse}</span>
      <span
        className={`font-semibold ${
          available === null
            ? "text-subtle"
            : availableIsOut
            ? "text-[var(--color-status-rejected-fg)]"
            : "text-foreground"
        }`}
      >
        残 {available === null ? "-" : available}
      </span>
    </div>
  );
}

// ============================================================
// Spec groups section (v3: 仕様 + バリエーションの 2 層、DnD 並び替え)
// ============================================================

type GroupDraft = {
  name: string;
  options: { label: string }[]; // 新規作成時のバリエーション入力欄
};

function emptyGroupDraft(): GroupDraft {
  return { name: "", options: [{ label: "" }, { label: "" }] };
}

function SpecGroupsSection({
  material,
  stock,
  onToast,
}: {
  material: MaterialDetail;
  stock: MaterialStockSummary;
  onToast: (msg: string) => void;
}) {
  const stockByOptionId = useMemo(() => {
    if (stock.kind !== "spec_options") return new Map<string, SpecOptionStock>();
    return new Map(stock.options.map((o) => [o.spec_option_id, o]));
  }, [stock]);
  const [creating, setCreating] = useState<GroupDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string } | null>(null);
  const [order, setOrder] = useState<SpecGroup[]>(material.spec_groups);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // サーバの spec_groups と local order を同期
  const serverIds = new Set(material.spec_groups.map((g) => g.id));
  const localIds = new Set(order.map((g) => g.id));
  const sameSet =
    serverIds.size === localIds.size &&
    [...serverIds].every((id) => localIds.has(id));
  if (!sameSet) {
    setOrder(material.spec_groups);
  }

  const startCreate = () => {
    setError(null);
    setEditingId(null);
    setCreating(emptyGroupDraft());
  };

  const startEdit = (g: SpecGroup) => {
    setError(null);
    setCreating(null);
    setEditingId(g.id);
    setEditDraft({ name: g.name });
  };

  const cancel = () => {
    setCreating(null);
    setEditingId(null);
    setEditDraft(null);
    setError(null);
  };

  const handleCreate = () => {
    if (!creating) return;
    if (!creating.name.trim()) {
      setError("仕様名は必須です");
      return;
    }
    const cleaned = creating.options.filter((o) => o.label.trim().length > 0);
    if (cleaned.length === 0) {
      setError("選択肢を 1 件以上入力してください");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createSpecGroupWithOptions(
          material.id,
          { name: creating.name },
          cleaned
        );
        onToast("追加しました");
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleUpdate = (groupId: string) => {
    if (!editDraft) return;
    if (!editDraft.name.trim()) {
      setError("仕様名は必須です");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateSpecGroup(material.id, groupId, { name: editDraft.name });
        onToast("更新しました");
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (g: SpecGroup) => {
    if (!confirm(`仕様「${g.name}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      try {
        await deleteSpecGroup(material.id, g.id);
        onToast("削除しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const fromIdx = next.findIndex((g) => g.id === dragId);
    const toIdx = next.findIndex((g) => g.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setOrder(next);
    setDragId(null);
    startTransition(async () => {
      try {
        await reorderSpecGroups(material.id, next.map((g) => g.id));
      } catch (e) {
        onToast(e instanceof Error ? e.message : "並び替えに失敗しました");
        setOrder(material.spec_groups);
      }
    });
  };

  return (
    <section>
      <SectionRule
        label="仕様"
        right={
          !creating &&
          !editingId && (
            <Button size="sm" onClick={startCreate}>
              + 仕様追加
            </Button>
          )
        }
        className="mb-4"
      />

      {order.length === 0 && !creating ? (
        <p className="text-sm text-subtle py-6 text-center border-y border-rule">
          仕様は未登録です。「+ 仕様追加」から規格などを作成してください。
        </p>
      ) : (
        <div className="space-y-3">
          {order.map((g) =>
            editingId === g.id && editDraft ? (
              <SpecGroupEditForm
                key={g.id}
                draft={editDraft}
                setDraft={setEditDraft}
                onSave={() => handleUpdate(g.id)}
                onCancel={cancel}
                pending={isPending}
              />
            ) : (
              <SpecGroupRow
                key={g.id}
                group={g}
                materialId={material.id}
                stockByOptionId={stockByOptionId}
                isDragging={dragId === g.id}
                onDragStart={() => setDragId(g.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(g.id)}
                onDragEnd={() => setDragId(null)}
                onEdit={() => startEdit(g)}
                onDelete={() => handleDelete(g)}
                onToast={onToast}
                pending={isPending}
              />
            )
          )}
        </div>
      )}

      {creating && (
        <div className="mt-3">
          <SpecGroupCreateForm
            draft={creating}
            setDraft={setCreating}
            onSave={handleCreate}
            onCancel={cancel}
            pending={isPending}
          />
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-[var(--color-status-rejected-fg)]">
          {error}
        </p>
      )}
    </section>
  );
}

function SpecGroupCreateForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: GroupDraft;
  setDraft: (d: GroupDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const addOption = () => {
    setDraft({ ...draft, options: [...draft.options, { label: "" }] });
  };
  const removeOption = (idx: number) => {
    setDraft({ ...draft, options: draft.options.filter((_, i) => i !== idx) });
  };
  const updateOption = (idx: number, label: string) => {
    setDraft({
      ...draft,
      options: draft.options.map((o, i) => (i === idx ? { label } : o)),
    });
  };
  return (
    <div className="border border-accent p-3 bg-[var(--color-status-pending-bg)]/40 space-y-3">
      <input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="仕様名 (例: 規格)"
        className="w-full h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div>
        <p className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-subtle mb-2">
          選択肢
        </p>
        <div className="space-y-1">
          {draft.options.map((o, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={o.label}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={idx === 0 ? "例: 2M" : idx === 1 ? "例: 3M" : "選択肢名"}
                className="flex-1 h-8 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeOption(idx)}
                disabled={draft.options.length <= 1}
              >
                削除
              </Button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOption}
          className="mt-2 text-xs text-accent hover:underline"
        >
          + 選択肢を追加
        </button>
      </div>
      <div className="flex justify-end gap-2 pt-1 border-t border-rule">
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending || !draft.name.trim()}>
          保存
        </Button>
      </div>
    </div>
  );
}

function SpecGroupEditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: { name: string };
  setDraft: (d: { name: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="border border-accent p-3 bg-[var(--color-status-pending-bg)]/40 space-y-3">
      <input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="仕様名"
        className="w-full h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending || !draft.name.trim()}>
          保存
        </Button>
      </div>
    </div>
  );
}

function SpecGroupRow({
  group,
  materialId,
  stockByOptionId,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete,
  onToast,
  pending,
}: {
  group: SpecGroup;
  materialId: string;
  stockByOptionId: Map<string, SpecOptionStock>;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToast: (msg: string) => void;
  pending: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`border border-rule px-5 py-4 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-3 min-w-0">
          <span className="cursor-grab text-subtle text-base select-none" aria-hidden>
            ⠿
          </span>
          <span className="text-lg font-bold text-foreground truncate">
            {group.name}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={pending}>
            削除
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            編集
          </Button>
        </div>
      </div>

      <SpecOptionsList
        materialId={materialId}
        group={group}
        stockByOptionId={stockByOptionId}
        onToast={onToast}
      />
    </div>
  );
}

function SpecOptionsList({
  materialId,
  group,
  stockByOptionId,
  onToast,
}: {
  materialId: string;
  group: SpecGroup;
  stockByOptionId: Map<string, SpecOptionStock>;
  onToast: (msg: string) => void;
}) {
  const [order, setOrder] = useState<SpecOption[]>(group.options);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [creatingLabel, setCreatingLabel] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const serverIds = new Set(group.options.map((o) => o.id));
  const localIds = new Set(order.map((o) => o.id));
  const sameSet =
    serverIds.size === localIds.size &&
    [...serverIds].every((id) => localIds.has(id));
  if (!sameSet) {
    setOrder(group.options);
  }

  const startEdit = (o: SpecOption) => {
    setError(null);
    setCreatingLabel(null);
    setEditingId(o.id);
    setEditLabel(o.label);
  };
  const startCreate = () => {
    setError(null);
    setEditingId(null);
    setCreatingLabel("");
  };
  const cancel = () => {
    setEditingId(null);
    setCreatingLabel(null);
    setError(null);
  };

  const handleCreate = () => {
    if (creatingLabel === null) return;
    if (!creatingLabel.trim()) {
      setError("選択肢名は必須です");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createSpecOption(materialId, group.id, { label: creatingLabel });
        onToast("追加しました");
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleUpdate = (optionId: string) => {
    if (!editLabel.trim()) {
      setError("選択肢名は必須です");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateSpecOption(materialId, group.id, optionId, { label: editLabel });
        onToast("更新しました");
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (o: SpecOption) => {
    if (!confirm(`選択肢「${o.label}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      try {
        await deleteSpecOption(materialId, group.id, o.id);
        onToast("削除しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = [...order];
    const fromIdx = next.findIndex((o) => o.id === dragId);
    const toIdx = next.findIndex((o) => o.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setOrder(next);
    setDragId(null);
    startTransition(async () => {
      try {
        await reorderSpecOptions(materialId, group.id, next.map((o) => o.id));
      } catch (e) {
        onToast(e instanceof Error ? e.message : "並び替えに失敗しました");
        setOrder(group.options);
      }
    });
  };

  return (
    <div className="border-t border-rule pt-3 mt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-subtle">
          選択肢 ({order.length})
        </span>
        {creatingLabel === null && !editingId && (
          <Button size="sm" variant="ghost" onClick={startCreate}>
            + 選択肢を追加
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {order.map((o) =>
          editingId === o.id ? (
            <div
              key={o.id}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--color-status-pending-bg)]/40 border-l-2 border-accent"
            >
              <input
                autoFocus
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="選択肢名 (例: 2M)"
                className="flex-1 h-8 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <Button size="sm" variant="ghost" onClick={cancel} disabled={isPending}>
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => handleUpdate(o.id)}
                disabled={isPending || !editLabel.trim()}
              >
                保存
              </Button>
            </div>
          ) : (
            <div
              key={o.id}
              draggable
              onDragStart={() => setDragId(o.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(o.id)}
              onDragEnd={() => setDragId(null)}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-muted ${
                dragId === o.id ? "opacity-50" : ""
              }`}
            >
              <span className="cursor-grab text-subtle text-sm select-none" aria-hidden>
                ⠿
              </span>
              <span className="flex-1 text-foreground truncate">
                {o.label}
              </span>
              <SpecOptionStockField
                materialId={materialId}
                groupId={group.id}
                optionId={o.id}
                summary={stockByOptionId.get(o.id)}
                onToast={onToast}
              />
              <Button size="sm" variant="ghost" onClick={() => handleDelete(o)} disabled={isPending}>
                削除
              </Button>
              <Button size="sm" variant="ghost" onClick={() => startEdit(o)}>
                編集
              </Button>
            </div>
          )
        )}
        {creatingLabel !== null && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-status-pending-bg)]/40 border-l-2 border-accent">
            <input
              autoFocus
              value={creatingLabel}
              onChange={(e) => setCreatingLabel(e.target.value)}
              placeholder="選択肢名 (例: 2M)"
              className="flex-1 h-8 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <Button size="sm" variant="ghost" onClick={cancel} disabled={isPending}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isPending || !creatingLabel.trim()}
            >
              保存
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-status-rejected-fg)]">
          {error}
        </p>
      )}
    </div>
  );
}

// spec_option 単位の「保有数」インライン編集 + 「貸出中 / 残」表示。
// onBlur で保存（手動でのボタン押下を要求しないシンプル UX）。
// 空文字 = 未設定（null）。0 を明示的に入れた場合は「在庫切れ」として扱う。
function SpecOptionStockField({
  materialId,
  groupId,
  optionId,
  summary,
  onToast,
}: {
  materialId: string;
  groupId: string;
  optionId: string;
  summary: SpecOptionStock | undefined;
  onToast: (msg: string) => void;
}) {
  const stockValue: number | null = summary?.stock ?? null;
  const inUse = summary?.in_use ?? 0;
  const initialString = stockValue === null ? "" : String(stockValue);
  const [value, setValue] = useState<string>(initialString);
  const [isPending, startTransition] = useTransition();
  const parsed: number | null =
    value === "" ? null : Math.max(0, Math.floor(Number(value) || 0));
  const liveAvailable: number | null =
    parsed === null ? null : Math.max(0, parsed - inUse);

  const save = () => {
    if (parsed === stockValue) return;
    startTransition(async () => {
      try {
        await updateSpecOptionStock(materialId, groupId, optionId, parsed);
        onToast(
          parsed === null ? "在庫を未設定にしました" : "在庫を更新しました"
        );
      } catch (e) {
        onToast(e instanceof Error ? e.message : "更新に失敗しました");
        setValue(initialString);
      }
    });
  };

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <input
        type="number"
        min={0}
        value={value}
        placeholder="-"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={isPending}
        aria-label="在庫数"
        title="空欄にすると未設定。0 で在庫切れを明示。"
        className="w-16 h-8 px-2 text-sm text-right tabular-nums bg-surface border border-rule focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
      />
      <span className="text-[11px] text-subtle tabular-nums whitespace-nowrap">
        貸出 {inUse} / 残{" "}
        {liveAvailable === null ? (
          <span className="font-semibold text-subtle">-</span>
        ) : (
          <span
            className={
              liveAvailable <= 0
                ? "text-[var(--color-status-rejected-fg)] font-semibold"
                : "font-semibold text-foreground"
            }
          >
            {liveAvailable}
          </span>
        )}
      </span>
    </div>
  );
}
