"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  FormField,
  TextInput,
  Button,
  ButtonLink,
  SectionRule,
} from "@/components/admin/ui";
import { createCustomer } from "../actions";

type CreatedCustomer = {
  id: string;
  companyId: string;
  tempPassword: string;
  name: string;
};

export default function NewCustomerForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [defaultAddress, setDefaultAddress] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedCustomer | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    startTransition(async () => {
      const result = await createCustomer({
        name,
        phone: phone || undefined,
        defaultAddress: defaultAddress || undefined,
        contactEmail: contactEmail || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setCreated({
        id: result.id,
        companyId: result.companyId,
        tempPassword: result.tempPassword,
        name,
      });
    });
  }

  if (created) {
    return <CredentialsCard customer={created} />;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormField label="会社名" htmlFor="customer-name" required>
        <TextInput
          id="customer-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="電話番号" htmlFor="customer-phone">
        <TextInput
          id="customer-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </FormField>
      <FormField
        label="既定の配送先住所"
        htmlFor="customer-address"
        hint="発注時に配送先のデフォルトとして自動入力されます"
      >
        <TextInput
          id="customer-address"
          type="text"
          value={defaultAddress}
          onChange={(e) => setDefaultAddress(e.target.value)}
        />
      </FormField>
      <FormField
        label="連絡先メールアドレス"
        htmlFor="customer-email"
        hint="リース会社からの連絡用"
      >
        <TextInput
          id="customer-email"
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
          {isPending ? "作成中…" : "作成して ID/PW を発行"}
        </Button>
        <Link
          href="/admin/customers"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}

function CredentialsCard({ customer }: { customer: CreatedCustomer }) {
  const [copied, setCopied] = useState<"id" | "pw" | null>(null);

  async function copy(value: string, kind: "id" | "pw") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-l-2 border-[var(--color-status-completed-fg)] bg-[var(--color-status-completed-bg)] px-4 py-3 text-sm text-[var(--color-status-completed-fg)]">
        <p className="font-semibold">「{customer.name}」を作成しました</p>
      </div>

      <div className="border-l-2 border-[var(--color-status-pending-fg)] bg-[var(--color-status-pending-bg)] px-4 py-3 text-sm text-[var(--color-status-pending-fg)]">
        <p className="font-semibold">パスワードはこの画面でしか表示されません</p>
        <p className="text-xs mt-1 leading-relaxed">
          画面を閉じると再表示できません。コピーして安全な方法で顧客に伝えてください。
        </p>
      </div>

      <SectionRule label="発行された認証情報" />

      <div className="space-y-3">
        <CredentialRow
          label="会社 ID"
          value={customer.companyId}
          copied={copied === "id"}
          onCopy={() => copy(customer.companyId, "id")}
        />
        <CredentialRow
          label="初期パスワード"
          value={customer.tempPassword}
          copied={copied === "pw"}
          onCopy={() => copy(customer.tempPassword, "pw")}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <ButtonLink href="/admin/customers" size="lg">
          一覧に戻る
        </ButtonLink>
        <Link
          href={`/admin/customers/${customer.id}`}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          詳細を見る
        </Link>
      </div>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </div>
      <code className="flex-1 px-3 py-2 bg-surface-muted border border-rule font-[family-name:var(--font-mono)] text-sm tabular-nums">
        {value}
      </code>
      <Button size="sm" variant="secondary" onClick={onCopy}>
        {copied ? "コピー済" : "コピー"}
      </Button>
    </div>
  );
}
