"use client";

import { useState, useTransition } from "react";
import type { AdminOfficeRow } from "@/lib/admin-data";
import {
  createOffice,
  deleteOffice,
  reorderOffices,
  updateOffice,
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
  | { mode: "edit"; office: AdminOfficeRow };

export default function AdminOfficesView({
  offices,
}: {
  offices: AdminOfficeRow[];
}) {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<AdminOfficeRow[]>(offices);

  if (
    offices.length !== order.length ||
    offices.some((o, i) => order[i]?.id !== o.id)
  ) {
    const serverIds = new Set(offices.map((o) => o.id));
    const localIds = new Set(order.map((o) => o.id));
    const sameSet =
      serverIds.size === localIds.size &&
      [...serverIds].every((id) => localIds.has(id));
    if (!sameSet) {
      setOrder(offices);
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
    const fromIdx = next.findIndex((o) => o.id === dragId);
    const toIdx = next.findIndex((o) => o.id === targetId);
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
        await reorderOffices(next.map((o) => o.id));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "並び替えに失敗しました");
        setOrder(offices);
      }
    });
  };

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        if (editing?.mode === "edit") {
          await updateOffice(editing.office.id, formData);
          showToast("更新しました");
        } else {
          await createOffice(formData);
          showToast("追加しました");
        }
        setEditing(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存に失敗しました");
      }
    });
  };

  const handleDelete = (office: AdminOfficeRow) => {
    if (office.in_use_count > 0) {
      showToast(
        "発注で使われているため削除できません。非公開にしてください。"
      );
      return;
    }
    if (!confirm(`営業所「${office.name}」を削除します。よろしいですか？`)) return;
    startTransition(async () => {
      try {
        await deleteOffice(office.id);
        showToast("削除しました");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="営業所マスタ"
        actions={
          <Button onClick={() => setEditing({ mode: "create" })}>
            + 新規追加
          </Button>
        }
      />

      <div className="flex items-center justify-between mb-3">
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle">
          {offices.length} 件
        </span>
        {order.length > 1 && (
          <span className="text-[11px] text-subtle">
            行をドラッグで並び替え
          </span>
        )}
      </div>

      {offices.length === 0 ? (
        <EmptyState
          title="営業所はまだ登録されていません"
          description="新規追加から最初の営業所を登録してください。"
        />
      ) : (
        <div className="border-y border-rule divide-y divide-rule">
          {order.map((o) => (
            <div
              key={o.id}
              draggable
              onDragStart={() => setDragId(o.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(o.id)}
              onDragEnd={() => setDragId(null)}
              className={`flex items-start justify-between gap-3 px-2 sm:px-3 py-4 bg-surface ${
                !o.is_active ? "opacity-50" : ""
              } ${dragId === o.id ? "opacity-40" : ""}`}
            >
              <span
                aria-hidden
                className="flex-shrink-0 mt-0.5 text-subtle hover:text-foreground cursor-grab active:cursor-grabbing select-none px-1"
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
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {o.name}
                  </p>
                  {o.area && (
                    <span className="font-[family-name:var(--font-mono)] text-[10px] px-1.5 py-0.5 bg-surface-muted text-subtle uppercase tracking-wider">
                      {o.area}
                    </span>
                  )}
                </div>
                {o.address && (
                  <p className="text-xs text-subtle truncate">{o.address}</p>
                )}
                <div className="flex gap-3 mt-1 text-xs text-subtle font-[family-name:var(--font-mono)]">
                  {o.phone && <span>TEL {o.phone}</span>}
                  {o.fax && <span>FAX {o.fax}</span>}
                  {o.in_use_count > 0 && (
                    <span className="text-[var(--color-status-pending-fg)]">
                      発注 {o.in_use_count} 件で使用
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(o)}
                  disabled={isPending || o.in_use_count > 0}
                  title={
                    o.in_use_count > 0
                      ? "発注で使われているため削除不可"
                      : "削除"
                  }
                >
                  削除
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing({ mode: "edit", office: o })}
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
          key={editing.mode === "edit" ? editing.office.id : "new"}
          initial={
            editing.mode === "edit"
              ? {
                  name: editing.office.name,
                  area: editing.office.area ?? "",
                  address: editing.office.address ?? "",
                  phone: editing.office.phone ?? "",
                  fax: editing.office.fax ?? "",
                  sort_order: editing.office.sort_order,
                  is_active: editing.office.is_active,
                }
              : {
                  name: "",
                  area: "",
                  address: "",
                  phone: "",
                  fax: "",
                  sort_order: (offices.at(-1)?.sort_order ?? 0) + 1,
                  is_active: true,
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
  area: string;
  address: string;
  phone: string;
  fax: string;
  sort_order: number;
  is_active: boolean;
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
  const [area, setArea] = useState(initial.area);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [fax, setFax] = useState(initial.fax);
  const [isActive, setIsActive] = useState(initial.is_active);

  const handleFormAction = (formData: FormData) => {
    formData.set("name", name);
    formData.set("area", area);
    formData.set("address", address);
    formData.set("phone", phone);
    formData.set("fax", fax);
    // create 時のみ末尾に追加されるよう、initial.sort_order をそのまま渡す。
    // edit 時は updateOffice が sort_order を無視する（D&D で並び替え）。
    if (!isEdit) formData.set("sort_order", String(initial.sort_order));
    formData.set("is_active", isActive ? "true" : "false");
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
              {isEdit ? "営業所を編集" : "営業所を追加"}
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
            <FormField label="営業所名" required>
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </FormField>
            <FormField label="エリア（例: 関東）">
              <TextInput
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </FormField>
            <FormField label="住所">
              <TextInput
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="電話番号">
                <TextInput
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </FormField>
              <FormField label="FAX">
                <TextInput
                  type="tel"
                  value={fax}
                  onChange={(e) => setFax(e.target.value)}
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-sm text-foreground">公開</span>
            </label>
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
