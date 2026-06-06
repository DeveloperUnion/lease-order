"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button, FormField, TextInput } from "@/components/admin/ui";

export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || !password) return;

    setStatus("signing");
    setErrorMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      setErrorMessage("メールアドレスまたはパスワードが正しくありません");
      return;
    }

    // セッション cookie はブラウザクライアントが保存済み。フルナビゲーションで
    // proxy を通し、テナント所属チェック・初回パスワード変更の誘導に乗せる。
    window.location.assign(next || "/admin");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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

      <FormField label="パスワード" htmlFor="password">
        <TextInput
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
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
        disabled={status === "signing" || !email || !password}
        className="w-full"
      >
        {status === "signing" ? "サインイン中…" : "サインイン"}
      </Button>
    </form>
  );
}
