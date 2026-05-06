"use client";

import { useState, useTransition } from "react";
import type { AdminUserRow } from "@/lib/admin-data";
import { addAdminUser, removeAdminUser } from "@/app/admin/actions";
import {
  PageHeader,
  SectionRule,
  Button,
  TextInput,
} from "@/components/admin/ui";

export default function AdminUsersView({
  users,
  currentEmail,
}: {
  users: AdminUserRow[];
  currentEmail: string | null;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        await addAdminUser(formData);
        setEmail("");
        showToast("追加しました");
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加に失敗しました");
      }
    });
  };

  const handleRemove = (u: AdminUserRow) => {
    if (!confirm(`${u.email} を許可リストから削除しますか？`)) return;
    startTransition(async () => {
      try {
        await removeAdminUser(u.id);
        showToast("削除しました");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "削除に失敗しました");
      }
    });
  };

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="設定"
        title="管理ユーザー"
        description="登録されたメールアドレスは /admin/login からマジックリンクでサインインできます。"
      />

      <section className="mb-10">
        <SectionRule label="ユーザーを追加" className="mb-3" />
        <form action={handleAdd} className="flex gap-2">
          <TextInput
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            className="flex-1"
          />
          <Button
            type="submit"
            size="md"
            disabled={isPending || !email.trim()}
          >
            {isPending ? "追加中…" : "+ 追加"}
          </Button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-[var(--color-status-rejected-fg)]">
            {error}
          </p>
        )}
      </section>

      <section>
        <SectionRule
          label="許可リスト"
          right={
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle">
              {users.length} 件
            </span>
          }
          className="mb-3"
        />
        {users.length === 0 ? (
          <p className="text-sm text-subtle border-y border-rule px-4 py-8 text-center">
            登録されたユーザーはいません
          </p>
        ) : (
          <div className="border-y border-rule divide-y divide-rule">
            {users.map((u) => {
              const isMe =
                currentEmail &&
                u.email.toLowerCase() === currentEmail.toLowerCase();
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate font-[family-name:var(--font-mono)]">
                        {u.email}
                      </span>
                      {isMe && (
                        <span className="font-[family-name:var(--font-mono)] text-[9px] px-1.5 py-0.5 bg-accent text-white uppercase tracking-wider">
                          自分
                        </span>
                      )}
                    </div>
                    <p className="font-[family-name:var(--font-mono)] text-[10px] text-subtle mt-0.5 uppercase tracking-wider">
                      登録 {new Date(u.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(u)}
                    disabled={isPending || !!isMe}
                    title={isMe ? "自分自身は削除できません" : "削除"}
                  >
                    削除
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
    </main>
  );
}
