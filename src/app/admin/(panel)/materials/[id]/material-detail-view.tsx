"use client";

import { useRef, useState, useTransition } from "react";
import type {
  AdminCategoryRow,
  MaterialDetail,
  MaterialImageRow,
} from "@/lib/admin-data";
import type { MaterialVariant } from "@/lib/types";
import {
  addMaterialImage,
  addVariant,
  deleteVariant,
  removeMaterialImage,
  reorderMaterialImages,
  setMaterialActive,
  setPrimaryMaterialImage,
  updateMaterial,
  updateVariant,
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

const MAX_IMAGES = 5;

export default function MaterialDetailView({
  material,
  categories,
}: {
  material: MaterialDetail;
  categories: AdminCategoryRow[];
}) {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <>
      <PageHeader
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
        <VariantsSection material={material} onToast={showToast} />
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
  const [sortOrder, setSortOrder] = useState(material.sort_order);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== material.name ||
    categoryId !== material.category_id ||
    (description ?? "") !== (material.description ?? "") ||
    sortOrder !== material.sort_order;

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("category_id", categoryId);
      fd.set("description", description);
      fd.set("sort_order", String(sortOrder));
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
        <FormField label="並び順" htmlFor="material-sort">
          <TextInput
            id="material-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            className="w-32"
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
      const fd = new FormData();
      fd.set("image", file);
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt=""
              className="w-full h-full object-contain pointer-events-none"
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
// Variants section
// ============================================================

type DraftVariant = {
  name: string;
  unit: string;
  sku: string;
  sort_order: number;
  is_active: boolean;
};

function emptyDraft(nextSort: number): DraftVariant {
  return { name: "", unit: "", sku: "", sort_order: nextSort, is_active: true };
}

function variantToDraft(v: MaterialVariant): DraftVariant {
  return {
    name: v.name,
    unit: v.unit ?? "",
    sku: v.sku ?? "",
    sort_order: v.sort_order,
    is_active: v.is_active,
  };
}

function VariantsSection({
  material,
  onToast,
}: {
  material: MaterialDetail;
  onToast: (msg: string) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; draft: DraftVariant } | null>(
    null
  );
  const [creating, setCreating] = useState<DraftVariant | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nextSort = (material.variants.at(-1)?.sort_order ?? 0) + 1;

  const startEdit = (v: MaterialVariant) => {
    setError(null);
    setCreating(null);
    setEditing({ id: v.id, draft: variantToDraft(v) });
  };

  const startCreate = () => {
    setError(null);
    setEditing(null);
    setCreating(emptyDraft(nextSort));
  };

  const cancel = () => {
    setEditing(null);
    setCreating(null);
    setError(null);
  };

  const handleSave = (draft: DraftVariant, variantId?: string) => {
    if (!draft.name.trim()) {
      setError("バリエーション名は必須です");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", draft.name);
      fd.set("unit", draft.unit);
      fd.set("sku", draft.sku);
      fd.set("sort_order", String(draft.sort_order));
      fd.set("is_active", draft.is_active ? "true" : "false");
      try {
        if (variantId) {
          await updateVariant(material.id, variantId, fd);
          onToast("更新しました");
        } else {
          await addVariant(material.id, fd);
          onToast("追加しました");
        }
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (v: MaterialVariant) => {
    if (!confirm(`バリエーション「${v.name}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      try {
        await deleteVariant(material.id, v.id);
        onToast("削除しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  return (
    <section>
      <SectionRule
        label="バリエーション"
        right={
          !creating &&
          !editing && (
            <Button size="sm" onClick={startCreate}>
              + 追加
            </Button>
          )
        }
        className="mb-4"
      />
      {material.variants.length === 0 && !creating ? (
        <p className="text-sm text-subtle py-6 text-center border-y border-rule">
          バリエーションは未登録です
        </p>
      ) : (
        <div className="border-y border-rule divide-y divide-rule">
          <div className="hidden sm:grid grid-cols-[1fr,80px,140px,60px,auto] gap-2 px-3 py-2 bg-surface-muted/60 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle">
            <span>名前</span>
            <span>単位</span>
            <span>SKU</span>
            <span className="text-right">並び順</span>
            <span></span>
          </div>

          {material.variants.map((v) => {
            if (editing?.id === v.id) {
              return (
                <VariantEditRow
                  key={v.id}
                  draft={editing.draft}
                  setDraft={(d) => setEditing({ id: v.id, draft: d })}
                  onSave={() => handleSave(editing.draft, v.id)}
                  onCancel={cancel}
                  pending={isPending}
                />
              );
            }
            return (
              <div
                key={v.id}
                className={`grid grid-cols-2 sm:grid-cols-[1fr,80px,140px,60px,auto] gap-2 items-center px-3 py-2.5 text-sm hover:bg-surface-muted ${
                  !v.is_active ? "opacity-50" : ""
                }`}
              >
                <div className="font-medium text-foreground truncate">{v.name}</div>
                <div className="text-muted text-xs sm:text-sm">{v.unit ?? "—"}</div>
                <div className="text-muted font-[family-name:var(--font-mono)] text-xs truncate">
                  {v.sku ?? "—"}
                </div>
                <div className="text-right text-muted font-[family-name:var(--font-mono)] tabular-nums text-xs">
                  {v.sort_order}
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(v)}
                    disabled={isPending}
                  >
                    削除
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => startEdit(v)}
                  >
                    編集
                  </Button>
                </div>
              </div>
            );
          })}

          {creating && (
            <VariantEditRow
              draft={creating}
              setDraft={setCreating}
              onSave={() => handleSave(creating)}
              onCancel={cancel}
              pending={isPending}
            />
          )}
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

function VariantEditRow({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: DraftVariant;
  setDraft: (d: DraftVariant) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[1fr,80px,140px,60px,auto] gap-2 items-center px-3 py-2.5 bg-[var(--color-status-pending-bg)]/40 border-l-2 border-accent">
      <input
        autoFocus
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="名前 (例: 2m)"
        className="h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <input
        value={draft.unit}
        onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
        placeholder="本/枚"
        className="h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <input
        value={draft.sku}
        onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
        placeholder="SKU"
        className="h-9 px-2 bg-surface border border-rule text-sm font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <input
        type="number"
        value={draft.sort_order}
        onChange={(e) =>
          setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
        }
        className="h-9 px-2 bg-surface border border-rule text-sm text-right tabular-nums font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-2">
        <label className="flex items-center gap-1 text-xs text-muted mr-2">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            className="w-3.5 h-3.5 accent-accent"
          />
          公開
        </label>
        <Button
          size="sm"
          variant="secondary"
          onClick={onCancel}
          disabled={pending}
        >
          取消
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={pending || !draft.name.trim()}
        >
          保存
        </Button>
      </div>
    </div>
  );
}
