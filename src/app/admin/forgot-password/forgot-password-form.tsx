"use client";

import { useState, useTransition } from "react";
import { requestAdminPasswordReset } from "./actions";
import { Button, FormField, TextInput } from "@/components/admin/ui";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      // 列挙防止のため、成否に関わらず常に同じ完了画面を出す。
      await requestAdminPasswordReset(formData);
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="text-sm text-muted leading-relaxed">
        <p>
          入力されたメールアドレスが登録されている場合、パスワード再設定用のリンクを送信しました。メールをご確認ください。
        </p>
        <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px] text-subtle">
          リンクの有効期限は 60 分です。
        </p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <FormField label="メールアドレス" htmlFor="email">
        <TextInput
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="h-11"
        />
      </FormField>

      <Button
        type="submit"
        size="lg"
        disabled={isPending || !email}
        className="w-full"
      >
        {isPending ? "送信中…" : "再設定リンクを送信"}
      </Button>
    </form>
  );
}
