"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "./actions";

type Props = {
  initialPhone: string;
  initialDefaultAddress: string;
};

export default function ProfileForm({ initialPhone, initialDefaultAddress }: Props) {
  const [phone, setPhone] = useState(initialPhone);
  const [defaultAddress, setDefaultAddress] = useState(initialDefaultAddress);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateProfile({ phone, defaultAddress });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="電話番号">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="既定の配送先住所" hint="発注時に配送先のデフォルトとして自動入力されます">
        <input
          type="text"
          value={defaultAddress}
          onChange={(e) => setDefaultAddress(e.target.value)}
          className="input"
        />
      </Field>

      {errorMessage && (
        <div role="alert" className="px-3 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 h-10 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
        >
          {isPending ? "保存中…" : "保存"}
          <span aria-hidden>→</span>
        </button>
        {savedAt && (
          <span className="text-xs text-success">
            保存しました · {savedAt}
          </span>
        )}
      </div>

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
