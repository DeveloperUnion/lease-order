"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import type {
  AdminCategoryRow,
  MaterialDetail,
  MaterialImageRow,
} from "@/lib/admin-data";
import type {
  MaterialVariantWithOptions,
  SpecGroup,
  SpecOption,
  SpecSelectionType,
} from "@/lib/types";
import {
  addMaterialImage,
  addVariant,
  createSpecGroup,
  createSpecOption,
  deleteSpecGroup,
  deleteSpecOption,
  deleteVariant,
  removeMaterialImage,
  reorderMaterialImages,
  setMaterialActive,
  setPrimaryMaterialImage,
  setVariantSpecOptions,
  updateMaterial,
  updateSpecGroup,
  updateSpecOption,
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
        <SpecGroupsSection material={material} onToast={showToast} />
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
// Variants section
// ============================================================

type DraftVariant = {
  name: string;
  unit: string;
  sku: string;
  sort_order: number;
  is_active: boolean;
  // spec_group_id -> spec_option_id ("" は未割当)
  optionByGroup: Record<string, string>;
};

function emptyDraft(nextSort: number, groups: SpecGroup[]): DraftVariant {
  return {
    name: "",
    unit: "",
    sku: "",
    sort_order: nextSort,
    is_active: true,
    optionByGroup: Object.fromEntries(groups.map((g) => [g.id, ""])),
  };
}

function variantToDraft(
  v: MaterialVariantWithOptions,
  groups: SpecGroup[]
): DraftVariant {
  const optionByGroup: Record<string, string> = Object.fromEntries(
    groups.map((g) => [g.id, ""])
  );
  for (const o of v.options) {
    optionByGroup[o.spec_group_id] = o.spec_option_id;
  }
  return {
    name: v.name,
    unit: v.unit ?? "",
    sku: v.sku ?? "",
    sort_order: v.sort_order,
    is_active: v.is_active,
    optionByGroup,
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
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nextSort = (material.variants.at(-1)?.sort_order ?? 0) + 1;
  const activeGroups = material.spec_groups.filter((g) => g.is_active);

  const startEdit = (v: MaterialVariantWithOptions) => {
    setError(null);
    setCreating(null);
    setEditing({ id: v.id, draft: variantToDraft(v, activeGroups) });
  };

  const startCreate = () => {
    setError(null);
    setEditing(null);
    setCreating(emptyDraft(nextSort, activeGroups));
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
        let targetId = variantId;
        if (variantId) {
          await updateVariant(material.id, variantId, fd);
        } else {
          await addVariant(material.id, fd);
          // 新規追加時の variant_id を取得するには再フェッチが必要。
          // ここでは spec 紐付の保存は次回編集に委ねる（追加直後はオプション未設定）。
          targetId = undefined;
        }
        if (targetId) {
          const selections = Object.entries(draft.optionByGroup)
            .filter(([, optId]) => optId)
            .map(([groupId, optId]) => ({
              spec_group_id: groupId,
              spec_option_id: optId,
            }));
          await setVariantSpecOptions(material.id, targetId, selections);
        }
        onToast(variantId ? "更新しました" : "追加しました");
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (v: MaterialVariantWithOptions) => {
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
      >
        <SectionRule
          label="在庫詳細（上級者向け）"
          right={
            <span className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-subtle">
              {open ? "▲ 閉じる" : "▼ 開く"}
            </span>
          }
          className="mb-2"
        />
      </button>
      <p className="text-xs text-subtle mb-3">
        {open
          ? `仕様の追加時に自動生成された組み合わせ ${material.variants.length} 件。SKU や個別単位の調整、無効化が必要なときだけ編集してください。`
          : `仕様の組み合わせ ${material.variants.length} 件。SKU や個別単位の調整、無効化はここで。通常は触らなくて OK。`}
      </p>
      {!open ? null : (
        <>
      <div className="flex justify-end mb-2">
        {!creating && !editing && (
          <Button size="sm" onClick={startCreate}>
            + 手動追加
          </Button>
        )}
      </div>
      {material.variants.length === 0 && !creating ? (
        <p className="text-sm text-subtle py-6 text-center border-y border-rule">
          バリエーションは未登録です。「仕様」セクションで仕様とバリエーションを追加してください。
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
                  groups={activeGroups}
                  setDraft={(d) => setEditing({ id: v.id, draft: d })}
                  onSave={() => handleSave(editing.draft, v.id)}
                  onCancel={cancel}
                  pending={isPending}
                />
              );
            }
            const optLabels = activeGroups
              .map((g) => {
                const optId = v.options.find((o) => o.spec_group_id === g.id)?.spec_option_id;
                const opt = g.options.find((o) => o.id === optId);
                return opt ? `${g.name}: ${opt.label}` : null;
              })
              .filter(Boolean) as string[];
            return (
              <div
                key={v.id}
                className={`grid grid-cols-2 sm:grid-cols-[1fr,80px,140px,60px,auto] gap-2 items-center px-3 py-2.5 text-sm hover:bg-surface-muted ${
                  !v.is_active ? "opacity-50" : ""
                }`}
              >
                <div className="font-medium text-foreground min-w-0">
                  <div className="truncate">{v.name}</div>
                  {optLabels.length > 0 && (
                    <div className="text-[11px] text-muted truncate mt-0.5">
                      {optLabels.join("  /  ")}
                    </div>
                  )}
                </div>
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
              groups={activeGroups}
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
        </>
      )}
    </section>
  );
}

function VariantEditRow({
  draft,
  groups,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: DraftVariant;
  groups: SpecGroup[];
  setDraft: (d: DraftVariant) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="px-3 py-2.5 bg-[var(--color-status-pending-bg)]/40 border-l-2 border-accent space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-[1fr,80px,140px,60px,auto] gap-2 items-center">
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
      {groups.length > 0 && (
        <div className="border-t border-rule pt-2 mt-2">
          <p className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-subtle mb-2">
            仕様（この組み合わせの内訳）
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {groups.map((g) => (
              <label key={g.id} className="flex flex-col gap-1">
                <span className="text-xs text-muted">{g.name}</span>
                <select
                  value={draft.optionByGroup[g.id] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      optionByGroup: {
                        ...draft.optionByGroup,
                        [g.id]: e.target.value,
                      },
                    })
                  }
                  className="h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  <option value="">— 未割当 —</option>
                  {g.options
                    .filter((o) => o.is_active)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-subtle mt-2">
            通常は「仕様」セクションで仕様とバリエーションを追加すれば自動生成されます。
            ここは手動で組み合わせを追加するときだけ使用します（新規時は「保存」後に再編集で割り当て）。
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Spec groups section
// ============================================================

type DraftSpecGroup = {
  name: string;
  description: string;
  selection_type: SpecSelectionType;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

type DraftSpecOption = {
  label: string;
  short_code: string;
  sort_order: number;
  is_active: boolean;
};

function emptyGroupDraft(nextSort: number): DraftSpecGroup {
  return {
    name: "",
    description: "",
    selection_type: "single",
    is_required: false,
    sort_order: nextSort,
    is_active: true,
  };
}

function groupToDraft(g: SpecGroup): DraftSpecGroup {
  return {
    name: g.name,
    description: g.description ?? "",
    selection_type: g.selection_type,
    is_required: g.is_required,
    sort_order: g.sort_order,
    is_active: g.is_active,
  };
}

function emptyOptionDraft(nextSort: number): DraftSpecOption {
  return { label: "", short_code: "", sort_order: nextSort, is_active: true };
}

function optionToDraft(o: SpecOption): DraftSpecOption {
  return {
    label: o.label,
    short_code: o.short_code ?? "",
    sort_order: o.sort_order,
    is_active: o.is_active,
  };
}

function SpecGroupsSection({
  material,
  onToast,
}: {
  material: MaterialDetail;
  onToast: (msg: string) => void;
}) {
  const [creatingGroup, setCreatingGroup] = useState<DraftSpecGroup | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<DraftSpecGroup | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nextGroupSort = (material.spec_groups.at(-1)?.sort_order ?? 0) + 1;

  const startGroupEdit = (g: SpecGroup) => {
    setError(null);
    setCreatingGroup(null);
    setEditingGroupId(g.id);
    setGroupDraft(groupToDraft(g));
  };

  const cancelGroupEdit = () => {
    setEditingGroupId(null);
    setGroupDraft(null);
    setCreatingGroup(null);
    setError(null);
  };

  const handleGroupSave = (draft: DraftSpecGroup, groupId?: string) => {
    if (!draft.name.trim()) {
      setError("仕様名は必須です");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          name: draft.name,
          description: draft.description.trim() || null,
          selectionType: draft.selection_type,
          isRequired: draft.is_required,
          sortOrder: draft.sort_order,
          isActive: draft.is_active,
        };
        if (groupId) {
          await updateSpecGroup(material.id, groupId, input);
        } else {
          await createSpecGroup(material.id, input);
        }
        onToast(groupId ? "更新しました" : "追加しました");
        cancelGroupEdit();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleGroupDelete = (g: SpecGroup) => {
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

  return (
    <section>
      <SectionRule
        label="仕様"
        right={
          !creatingGroup &&
          !editingGroupId && (
            <Button
              size="sm"
              onClick={() => {
                setError(null);
                setEditingGroupId(null);
                setCreatingGroup(emptyGroupDraft(nextGroupSort));
              }}
            >
              + 仕様追加
            </Button>
          )
        }
        className="mb-4"
      />
      {material.spec_groups.length === 0 && !creatingGroup ? (
        <p className="text-sm text-subtle py-6 text-center border-y border-rule">
          仕様は未登録です。「+ 仕様追加」から色やサイズなどを作成してください。
        </p>
      ) : (
        <div className="space-y-3">
          {material.spec_groups.map((g) =>
            editingGroupId === g.id && groupDraft ? (
              <SpecGroupEditForm
                key={g.id}
                draft={groupDraft}
                setDraft={setGroupDraft}
                onSave={() => handleGroupSave(groupDraft, g.id)}
                onCancel={cancelGroupEdit}
                pending={isPending}
              />
            ) : (
              <SpecGroupRow
                key={g.id}
                group={g}
                materialId={material.id}
                onEdit={() => startGroupEdit(g)}
                onDelete={() => handleGroupDelete(g)}
                onToast={onToast}
                pending={isPending}
              />
            )
          )}

          {creatingGroup && (
            <SpecGroupEditForm
              draft={creatingGroup}
              setDraft={setCreatingGroup}
              onSave={() => handleGroupSave(creatingGroup)}
              onCancel={cancelGroupEdit}
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

function SpecGroupEditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: DraftSpecGroup;
  setDraft: (d: DraftSpecGroup) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="border border-accent p-3 bg-[var(--color-status-pending-bg)]/40 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr,140px,60px] gap-2">
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="仕様名 (例: 色)"
          className="h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <select
          value={draft.selection_type}
          onChange={(e) =>
            setDraft({
              ...draft,
              selection_type: e.target.value as SpecSelectionType,
            })
          }
          className="h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="single">単一選択</option>
          <option value="multi">複数選択可</option>
        </select>
        <input
          type="number"
          value={draft.sort_order}
          onChange={(e) =>
            setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
          }
          className="h-9 px-2 bg-surface border border-rule text-sm text-right tabular-nums font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <input
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="説明（任意）"
        className="w-full h-9 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={draft.is_required}
              onChange={(e) =>
                setDraft({ ...draft, is_required: e.target.checked })
              }
              className="w-3.5 h-3.5 accent-accent"
            />
            必須
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) =>
                setDraft({ ...draft, is_active: e.target.checked })
              }
              className="w-3.5 h-3.5 accent-accent"
            />
            公開
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button size="sm" onClick={onSave} disabled={pending || !draft.name.trim()}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function SpecGroupRow({
  group,
  materialId,
  onEdit,
  onDelete,
  onToast,
  pending,
}: {
  group: SpecGroup;
  materialId: string;
  onEdit: () => void;
  onDelete: () => void;
  onToast: (msg: string) => void;
  pending: boolean;
}) {
  return (
    <div
      className={`border border-rule p-3 space-y-3 ${
        !group.is_active ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{group.name}</span>
            <span className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider px-1.5 py-0.5 bg-surface-muted text-subtle border border-rule">
              {group.selection_type === "multi" ? "複数選択可" : "単一選択"}
            </span>
            {group.is_required && (
              <span className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--color-status-rejected-bg)] text-[var(--color-status-rejected-fg)]">
                必須
              </span>
            )}
            {!group.is_active && (
              <span className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider px-1.5 py-0.5 bg-surface-muted text-subtle">
                非公開
              </span>
            )}
          </div>
          {group.description && (
            <p className="text-xs text-muted mt-1">{group.description}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
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
        onToast={onToast}
      />
    </div>
  );
}

function SpecOptionsList({
  materialId,
  group,
  onToast,
}: {
  materialId: string;
  group: SpecGroup;
  onToast: (msg: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSpecOption | null>(null);
  const [creating, setCreating] = useState<DraftSpecOption | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nextSort = (group.options.at(-1)?.sort_order ?? 0) + 1;

  const startEdit = (o: SpecOption) => {
    setError(null);
    setCreating(null);
    setEditingId(o.id);
    setDraft(optionToDraft(o));
  };
  const startCreate = () => {
    setError(null);
    setEditingId(null);
    setDraft(null);
    setCreating(emptyOptionDraft(nextSort));
  };
  const cancel = () => {
    setEditingId(null);
    setDraft(null);
    setCreating(null);
    setError(null);
  };

  const handleSave = (d: DraftSpecOption, optionId?: string) => {
    if (!d.label.trim()) {
      setError("バリエーション名は必須です");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const input = {
          label: d.label,
          shortCode: d.short_code.trim() || null,
          sortOrder: d.sort_order,
          isActive: d.is_active,
        };
        if (optionId) {
          await updateSpecOption(materialId, group.id, optionId, input);
        } else {
          await createSpecOption(materialId, group.id, input);
        }
        onToast(optionId ? "更新しました" : "追加しました");
        cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (o: SpecOption) => {
    if (!confirm(`バリエーション「${o.label}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      try {
        await deleteSpecOption(materialId, group.id, o.id);
        onToast("削除しました");
      } catch (e) {
        onToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  return (
    <div className="border-t border-rule pt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-subtle">
          バリエーション ({group.options.length})
        </span>
        {!creating && !editingId && (
          <Button size="sm" variant="ghost" onClick={startCreate}>
            + バリエーション追加
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {group.options.map((o) =>
          editingId === o.id && draft ? (
            <SpecOptionEditRow
              key={o.id}
              draft={draft}
              setDraft={setDraft}
              onSave={() => handleSave(draft, o.id)}
              onCancel={cancel}
              pending={isPending}
            />
          ) : (
            <div
              key={o.id}
              className={`flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-surface-muted ${
                !o.is_active ? "opacity-50" : ""
              }`}
            >
              <span className="flex-1 font-medium text-foreground truncate">
                {o.label}
              </span>
              {o.short_code && (
                <span className="text-[10px] font-[family-name:var(--font-mono)] text-subtle">
                  {o.short_code}
                </span>
              )}
              <span className="text-[10px] font-[family-name:var(--font-mono)] tabular-nums text-subtle w-6 text-right">
                {o.sort_order}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(o)}
                disabled={isPending}
              >
                削除
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startEdit(o)}
              >
                編集
              </Button>
            </div>
          )
        )}
        {creating && (
          <SpecOptionEditRow
            draft={creating}
            setDraft={setCreating}
            onSave={() => handleSave(creating)}
            onCancel={cancel}
            pending={isPending}
          />
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

function SpecOptionEditRow({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: DraftSpecOption;
  setDraft: (d: DraftSpecOption) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--color-status-pending-bg)]/40 border-l-2 border-accent">
      <input
        autoFocus
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder="バリエーション名 (例: 赤)"
        className="flex-1 h-8 px-2 bg-surface border border-rule text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <input
        value={draft.short_code}
        onChange={(e) => setDraft({ ...draft, short_code: e.target.value })}
        placeholder="略号"
        className="w-20 h-8 px-2 bg-surface border border-rule text-xs font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <input
        type="number"
        value={draft.sort_order}
        onChange={(e) =>
          setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
        }
        className="w-12 h-8 px-1 bg-surface border border-rule text-xs text-right tabular-nums font-[family-name:var(--font-mono)] focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <label className="flex items-center gap-1 text-[10px] text-muted">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          className="w-3 h-3 accent-accent"
        />
        公開
      </label>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
        取消
      </Button>
      <Button
        size="sm"
        onClick={onSave}
        disabled={pending || !draft.label.trim()}
      >
        保存
      </Button>
    </div>
  );
}
