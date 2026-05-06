"use client";

import { useState, useTransition } from "react";
import {
  resetCustomerPassword,
  setCustomerActive,
  updateCustomer,
} from "../actions";
import type { AdminCustomerRow } from "@/lib/admin-data";
import {
  FormField,
  TextInput,
  Button,
  SectionRule,
} from "@/components/admin/ui";

export default function EditCustomerForm({
  customer,
}: {
  customer: AdminCustomerRow;
}) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [defaultAddress, setDefaultAddress] = useState(
    customer.default_address ?? ""
  );
  const [contactEmail, setContactEmail] = useState(customer.contact_email ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await updateCustomer({
        id: customer.id,
        name,
        phone,
        defaultAddress,
        contactEmail,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
    });
  }

  function onResetPassword() {
    if (
      !confirm(
        "パスワードを再発行します。新しい初期パスワードを顧客に伝える必要があります。よろしいですか？"
      )
    )
      return;
    startTransition(async () => {
      const result = await resetCustomerPassword(customer.id);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setResetPassword(result.tempPassword);
    });
  }

  function onToggleActive() {
    const next = !customer.is_active;
    if (
      !confirm(
        next
          ? "このアカウントを有効にしますか？"
          : "このアカウントを無効にしますか？無効化するとログインできなくなります。"
      )
    )
      return;
    startTransition(async () => {
      const result = await setCustomerActive(customer.id, next);
      if (!result.ok) {
        setErrorMessage(result.error);
      }
    });
  }

  return (
    <div className="space-y-8">
      {resetPassword && (
        <div className="border-l-2 border-[var(--color-status-pending-fg)] bg-[var(--color-status-pending-bg)] px-4 py-3 text-sm text-[var(--color-status-pending-fg)]">
          <p className="font-semibold">新しい初期パスワード</p>
          <p className="text-xs mb-2 leading-relaxed">
            この画面を閉じると再表示できません。コピーして顧客に伝えてください。
          </p>
          <code className="block px-3 py-2 bg-surface border border-rule font-[family-name:var(--font-mono)] text-sm tabular-nums text-foreground">
            {resetPassword}
          </code>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <FormField label="会社名" htmlFor="ec-name" required>
          <TextInput
            id="ec-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="電話番号" htmlFor="ec-phone">
          <TextInput
            id="ec-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        <FormField label="既定の配送先住所" htmlFor="ec-address">
          <TextInput
            id="ec-address"
            type="text"
            value={defaultAddress}
            onChange={(e) => setDefaultAddress(e.target.value)}
          />
        </FormField>
        <FormField label="連絡先メールアドレス" htmlFor="ec-email">
          <TextInput
            id="ec-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </FormField>

        {errorMessage && (
          <div
            role="alert"
            className="px-3 py-2 border-l-2 border-[var(--color-status-rejected-fg)] bg-[var(--color-status-rejected-bg)] text-sm text-[var(--color-status-rejected-fg)]"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="lg" disabled={isPending || !name.trim()}>
            {isPending ? "保存中…" : "保存"}
          </Button>
          {savedAt && (
            <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-status-completed-fg)]">
              保存しました（{savedAt}）
            </span>
          )}
        </div>
      </form>

      <div>
        <SectionRule label="アカウント操作" className="mb-4" />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={onResetPassword}
            disabled={isPending}
          >
            パスワード再発行
          </Button>
          <Button
            variant={customer.is_active ? "danger" : "secondary"}
            onClick={onToggleActive}
            disabled={isPending}
          >
            {customer.is_active ? "アカウントを無効化" : "アカウントを有効化"}
          </Button>
        </div>
      </div>
    </div>
  );
}
