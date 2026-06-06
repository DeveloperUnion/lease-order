"use client";

import { useState, useTransition } from "react";
import type { AdminUserRow } from "@/lib/admin-data";
import {
  addAdminUser,
  removeAdminUser,
  resetAdminPassword,
} from "@/app/admin/actions";
import {
  PageHeader,
  SectionRule,
  Button,
  TextInput,
} from "@/components/admin/ui";

type Credential = { email: string; tempPassword: string; kind: "added" | "reset" };

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
  const [cred, setCred] = useState<Credential | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await addAdminUser(formData);
        setEmail("");
        setCred({ ...res, kind: "added" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加に失敗しました");
      }
    });
  };

  const handleReset = (u: AdminUserRow) => {
    if (!confirm(`${u.email} のパスワードを再発行しますか？`)) return;
    startTransition(async () => {
      try {
        const res = await resetAdminPassword(u.id);
        setCred({ ...res, kind: "reset" });
      } catch (e) {
        showToast(e instanceof Error ? e.message : "再発行に失敗しました");
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
    <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="管理ユーザー"
        description="登録したメールアドレスは /admin/login からパスワードでサインインできます。追加・再発行で発行された初期パスワードは初回サインイン後に変更が必要です。"
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-foreground truncate font-[family-name:var(--font-mono)]">
                        {u.email}
                      </span>
                      {isMe && (
                        <span className="font-[family-name:var(--font-mono)] text-[9px] px-1.5 py-0.5 bg-accent text-white uppercase tracking-wider">
                          自分
                        </span>
                      )}
                      {u.must_change_password && (
                        <span className="font-[family-name:var(--font-mono)] text-[9px] px-1.5 py-0.5 bg-[var(--color-status-pending-bg)] text-[var(--color-status-pending-fg)] uppercase tracking-wider">
                          PW未変更
                        </span>
                      )}
                    </div>
                    <p className="font-[family-name:var(--font-mono)] text-[10px] text-subtle mt-0.5 uppercase tracking-wider">
                      登録 {new Date(u.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReset(u)}
                      disabled={isPending}
                      title="パスワードを再発行"
                    >
                      PW再発行
                    </Button>
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
                </div>
              );
            })}
          </div>
        )}
      </section>

      {cred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4">
          <div className="bg-surface border border-rule-strong shadow-2xl w-full max-w-md">
            <header className="px-6 pt-6 pb-4 border-b border-rule">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-foreground">
                {cred.kind === "added"
                  ? "管理ユーザーを追加しました"
                  : "パスワードを再発行しました"}
              </h2>
              <p className="text-sm text-muted mt-1.5 leading-relaxed">
                初期パスワードはこの画面でのみ表示されます。本人に安全に共有してください。初回サインイン後に変更が必要です。
              </p>
            </header>
            <div className="px-6 py-5 space-y-3">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-subtle mb-1">
                  メールアドレス
                </p>
                <p className="text-sm text-foreground font-[family-name:var(--font-mono)] break-all">
                  {cred.email}
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-subtle mb-1">
                  初期パスワード
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-base text-foreground bg-surface-muted px-3 py-2 font-[family-name:var(--font-mono)] tracking-wide break-all">
                    {cred.tempPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard?.writeText(cred.tempPassword);
                      showToast("コピーしました");
                    }}
                  >
                    コピー
                  </Button>
                </div>
              </div>
            </div>
            <footer className="px-6 pb-6 pt-1 flex justify-end">
              <Button size="md" onClick={() => setCred(null)}>
                閉じる
              </Button>
            </footer>
          </div>
        </div>
      )}

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
