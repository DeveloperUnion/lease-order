"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Category, Material } from "@/lib/types";
import {
  createMaterial,
  reorderMaterials,
  setMaterialActive,
} from "@/app/admin/actions";
import {
  PageHeader,
  Button,
  FormField,
  TextInput,
  Select,
  EmptyState,
} from "@/components/admin/ui";

export default function AdminMaterialsView({
  categories,
  allMaterials,
}: {
  categories: Category[];
  allMaterials: Material[];
}) {
  const router = useRouter();
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    categories[0]?.id ?? ""
  );
  const [creating, setCreating] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  const filtered = allMaterials
    .filter((m) => m.category_id === selectedCategoryId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const [order, setOrder] = useState<Material[]>(filtered);

  // Re-sync local order whenever the server-side set changes (category switch,
  // create/delete, etc.). Mirrors the pattern used in ImagesSection.
  if (
    filtered.length !== order.length ||
    filtered.some((m, i) => order[i]?.id !== m.id)
  ) {
    const serverIds = new Set(filtered.map((m) => m.id));
    const localIds = new Set(order.map((m) => m.id));
    const sameSet =
      serverIds.size === localIds.size &&
      [...serverIds].every((id) => localIds.has(id));
    if (!sameSet) {
      setOrder(filtered);
    }
  }

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 1800);
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = [...order];
    const fromIdx = next.findIndex((m) => m.id === dragId);
    const toIdx = next.findIndex((m) => m.id === targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null);
      return;
    }
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setOrder(next);
    setDragId(null);
    startTransition(async () => {
      try {
        await reorderMaterials(
          selectedCategoryId,
          next.map((m) => m.id)
        );
      } catch (e) {
        showToast(e instanceof Error ? e.message : "並び替えに失敗しました");
        setOrder(filtered);
      }
    });
  };

  const handleToggleActive = (material: Material) => {
    startTransition(async () => {
      try {
        await setMaterialActive(material.id, !material.is_active);
        showToast(material.is_active ? "非公開にしました" : "公開しました");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "更新に失敗しました");
      }
    });
  };

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="資材マスタ"
        description="カテゴリごとに資材を編集します。公開／非公開の切り替えは即時反映されます。"
        actions={<Button onClick={() => setCreating(true)}>+ 新規追加</Button>}
      />

      <div className="flex gap-0 overflow-x-auto pb-0 mb-6 -mx-4 px-4 border-b border-rule">
        {categories.map((cat) => {
          const isActive = selectedCategoryId === cat.id;
          const count = allMaterials.filter((m) => m.category_id === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-3 text-sm transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-accent text-foreground font-medium"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <span>{cat.name}</span>
              <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] text-subtle">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle">
          {filtered.length} 件
        </span>
        {order.length > 1 && (
          <span className="text-[11px] text-subtle">
            行をドラッグで並び替え
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="このカテゴリには資材がありません"
          description="上のフォームから資材を新規登録してください。"
        />
      ) : (
        <div className="border-y border-rule divide-y divide-rule">
          {order.map((mat) => (
            <div
              key={mat.id}
              draggable
              onDragStart={() => setDragId(mat.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(mat.id)}
              onDragEnd={() => setDragId(null)}
              className={`flex items-center justify-between gap-3 px-2 sm:px-3 py-3 bg-surface ${
                !mat.is_active ? "opacity-50" : ""
              } ${dragId === mat.id ? "opacity-40" : ""}`}
            >
              <span
                aria-hidden
                className="flex-shrink-0 text-subtle hover:text-foreground cursor-grab active:cursor-grabbing select-none px-1"
                title="ドラッグで並び替え"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <circle cx="7" cy="5" r="1.4" />
                  <circle cx="7" cy="10" r="1.4" />
                  <circle cx="7" cy="15" r="1.4" />
                  <circle cx="13" cy="5" r="1.4" />
                  <circle cx="13" cy="10" r="1.4" />
                  <circle cx="13" cy="15" r="1.4" />
                </svg>
              </span>
              <Link
                href={`/admin/materials/${mat.id}`}
                draggable={false}
                className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity"
              >
                <div className="w-12 h-12 bg-surface-muted border border-rule flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {mat.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mat.image_url}
                      alt=""
                      draggable={false}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="font-[family-name:var(--font-mono)] text-[9px] text-subtle uppercase">
                      no img
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {mat.name}
                  </p>
                  <p className="text-xs text-subtle truncate">
                    {mat.description || "説明なし"}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggleActive(mat)}
                  disabled={isPending}
                >
                  {mat.is_active ? "非公開" : "公開"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push(`/admin/materials/${mat.id}`)}
                >
                  編集
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toastMessage && (
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
            <p className="text-sm font-medium text-foreground">{toastMessage}</p>
          </div>
        </div>
      )}

      {creating && (
        <CreateModal
          categories={categories}
          defaultCategoryId={selectedCategoryId}
          defaultSortOrder={(filtered.at(-1)?.sort_order ?? 0) + 1}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/admin/materials/${id}`);
          }}
        />
      )}
    </main>
  );
}

function CreateModal({
  categories,
  defaultCategoryId,
  defaultSortOrder,
  onClose,
  onCreated,
}: {
  categories: Category[];
  defaultCategoryId: string;
  defaultSortOrder: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    formData.set("category_id", categoryId);
    formData.set("name", name);
    formData.set("description", "");
    formData.set("sort_order", String(defaultSortOrder));
    formData.set("is_active", "true");
    startTransition(async () => {
      try {
        const id = await createMaterial(formData);
        onCreated(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "作成に失敗しました");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border-t border-rule-strong sm:border sm:border-rule-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <form action={handleSubmit} className="p-6">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-rule">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-foreground">
              資材を追加
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-subtle hover:text-foreground"
              aria-label="閉じる"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <p className="text-xs text-subtle mb-5 leading-relaxed">
            まず最低限の情報で作成し、続けて詳細ページで画像・バリエーション・説明を編集できます。
          </p>

          <div className="space-y-4">
            <FormField label="カテゴリ" htmlFor="cat">
              <Select
                id="cat"
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
            <FormField label="資材名" htmlFor="name" required>
              <TextInput
                id="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </FormField>
          </div>

          {error && (
            <p className="mt-4 text-sm text-[var(--color-status-rejected-fg)]">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={onClose}
              disabled={isPending}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={isPending || !name.trim()}
              className="flex-1"
            >
              {isPending ? "作成中…" : "作成して詳細へ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
