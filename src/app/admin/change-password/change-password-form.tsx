"use client";

import { useState } from "react";
import { changeAdminPassword } from "@/app/admin/actions";
import { Button, FormField, TextInput } from "@/components/admin/ui";

export default function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setErrorMessage("新しいパスワードは 8 文字以上で入力してください");
      return;
    }
    if (newPassword !== confirm) {
      setErrorMessage("確認用パスワードが一致しません");
      return;
    }

    setStatus("saving");
    setErrorMessage(null);
    const res = await changeAdminPassword({ newPassword });
    if (!res.ok) {
      setStatus("error");
      setErrorMessage(res.error);
      return;
    }
    window.location.assign("/admin");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormField label="新しいパスワード" htmlFor="new-password">
        <TextInput
          id="new-password"
          name="new-password"
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="8 文字以上"
          className="h-11"
        />
      </FormField>

      <FormField label="新しいパスワード（確認）" htmlFor="confirm-password">
        <TextInput
          id="confirm-password"
          name="confirm-password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="もう一度入力"
          className="h-11"
        />
      </FormField>

      {errorMessage && (
        <p className="text-sm text-[var(--color-status-rejected-fg)]">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={status === "saving" || !newPassword || !confirm}
        className="w-full"
      >
        {status === "saving" ? "更新中…" : "パスワードを変更"}
      </Button>
    </form>
  );
}
