"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button, FormField, TextInput } from "@/components/admin/ui";

export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;

    setStatus("sending");
    setErrorMessage(null);

    const supabase = createSupabaseBrowserClient();
    // クリーンパス。proxy が /super-admin/auth/callback へ rewrite する。
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: true,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center text-center py-3">
        <div className="flex items-center justify-center w-10 h-10 bg-[var(--color-status-completed-bg)] text-[var(--color-status-completed-fg)] mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-[family-name:var(--font-display)] text-base font-medium text-foreground mb-1">
          メールを送信しました
        </p>
        <p className="text-sm text-muted leading-relaxed">
          <span className="font-[family-name:var(--font-mono)] text-foreground">
            {email}
          </span>
          <br />
          宛のログインリンクを開いてください。
        </p>
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wider text-subtle mt-3">
          届かない場合は迷惑メールフォルダもご確認ください
        </p>
      </div>
    );
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
          placeholder="ops@kensetsu-tech.com"
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
        disabled={status === "sending" || !email}
        className="w-full"
      >
        {status === "sending" ? "送信中…" : "ログインリンクを送信"}
      </Button>
    </form>
  );
}
