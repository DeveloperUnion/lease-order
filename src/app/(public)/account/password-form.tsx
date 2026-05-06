"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "./actions";

export default function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const localValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccess(false);

    if (!currentPassword || !newPassword) {
      setErrorMessage("すべての項目を入力してください");
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage("新しいパスワードは 8 文字以上にしてください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("新しいパスワードと確認が一致しません");
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMessage("新しいパスワードは現在のパスワードと異なるものにしてください");
      return;
    }

    startTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (result.mustChangePasswordCleared) {
        router.push("/");
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="現在のパスワード">
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="input"
        />
      </Field>
      <Field label="新しいパスワード" hint="8 文字以上">
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="input"
        />
      </Field>
      <Field label="新しいパスワード（確認）">
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="input"
        />
      </Field>

      {errorMessage && (
        <div role="alert" className="px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}
      {success && (
        <div role="status" className="px-3 py-2 rounded-lg border border-success/30 bg-success-soft text-sm text-success">
          パスワードを変更しました{mustChange && "。トップページに移動します"}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !localValid}
        className="px-5 h-10 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
      >
        {isPending ? "変更中…" : "パスワードを変更"}
        <span aria-hidden>→</span>
      </button>

      <style jsx>{`
        .input {
          width: 100%;
          height: 2.5rem;
          padding: 0 0.875rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          color: var(--color-foreground);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-accent) 15%, transparent);
        }
      `}</style>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-subtle mt-1">{hint}</p>}
    </div>
  );
}
