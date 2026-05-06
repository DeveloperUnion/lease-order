"use client";

import { useState, useTransition } from "react";
import type { AdminCategoryRow } from "@/lib/admin-data";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/app/admin/actions";
import {
  PageHeader,
  Button,
  FormField,
  TextInput,
  EmptyState,
} from "@/components/admin/ui";

type EditingState =
  | { mode: "create" }
  | { mode: "edit"; category: AdminCategoryRow };

export default function AdminCategoriesView({
  categories,
}: {
  categories: AdminCategoryRow[];
}) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 1800);
  };

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        if (editing?.mode === "edit") {
          await updateCategory(editing.category.id, formData);
          showToast("更新しました");
        } else {
          await createCategory(formData);
          showToast("追加しました");
        }
        setEditing(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (cat: AdminCategoryRow) => {
    if (cat.material_count > 0) {
      showToast("資材が紐付いているため削除できません");
      return;
    }
    if (!confirm(`カテゴリ「${cat.name}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      try {
        await deleteCategory(cat.id);
        showToast("削除しました");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="カテゴリマスタ"
        actions={
          <Button onClick={() => setEditing({ mode: "create" })}>
            + 新規追加
          </Button>
        }
      />

      <div className="flex items-center justify-between mb-3">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle">
          {categories.length} 件
        </span>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="カテゴリはまだ登録されていません"
          description="新規追加から最初のカテゴリを登録してください。"
        />
      ) : (
        <div className="border-y border-rule divide-y divide-rule">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between px-3 sm:px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-surface-muted border border-rule flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {cat.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={cat.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-[family-name:var(--font-mono)] text-[9px] text-subtle uppercase">
                      no img
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {cat.name}
                  </p>
                  <p className="font-[family-name:var(--font-mono)] text-[11px] text-subtle truncate">
                    {cat.slug} ／ 資材 {cat.material_count} 件
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(cat)}
                  disabled={isPending || cat.material_count > 0}
                  title={
                    cat.material_count > 0
                      ? "資材が紐付いているため削除不可"
                      : "削除"
                  }
                >
                  削除
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing({ mode: "edit", category: cat })}
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

      {editing && (
        <EditModal
          key={editing.mode === "edit" ? editing.category.id : "new"}
          initial={
            editing.mode === "edit"
              ? {
                  name: editing.category.name,
                  slug: editing.category.slug,
                  sort_order: editing.category.sort_order,
                  image_url: editing.category.image_url,
                }
              : {
                  name: "",
                  slug: "",
                  sort_order: (categories.at(-1)?.sort_order ?? 0) + 1,
                  image_url: null,
                }
          }
          isEdit={editing.mode === "edit"}
          pending={isPending}
          error={error}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          onSubmit={handleSubmit}
        />
      )}
    </main>
  );
}

type EditInitial = {
  name: string;
  slug: string;
  sort_order: number;
  image_url: string | null;
};

function EditModal({
  initial,
  isEdit,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  initial: EditInitial;
  isEdit: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [sortOrder, setSortOrder] = useState(initial.sort_order);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    initial.image_url
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleFormAction = (formData: FormData) => {
    formData.set("name", name);
    formData.set("slug", slug);
    formData.set("sort_order", String(sortOrder));
    if (imageFile) formData.set("image", imageFile);
    onSubmit(formData);
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
        <form action={handleFormAction} className="p-6">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-rule">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-foreground">
              {isEdit ? "カテゴリを編集" : "カテゴリを追加"}
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

          <div className="space-y-4">
            <FormField label="カテゴリ名" required>
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </FormField>
            <FormField
              label="slug"
              hint="URL に使われます。空欄なら名前から自動生成"
            >
              <TextInput
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="例: karigakoi"
                className="font-[family-name:var(--font-mono)]"
              />
            </FormField>
            <FormField label="画像">
              <div className="flex items-center gap-4">
                {imagePreview && (
                  <div className="w-16 h-16 bg-surface-muted border border-rule overflow-hidden flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="text-sm text-muted file:mr-3 file:h-9 file:px-4 file:border-0 file:text-xs file:font-medium file:bg-surface-muted file:text-foreground file:font-[family-name:var(--font-mono)] file:uppercase file:tracking-wider hover:file:bg-rule"
                />
              </div>
            </FormField>
            <FormField label="並び順">
              <TextInput
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
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
              disabled={pending}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={pending || !name.trim()}
              className="flex-1"
            >
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
