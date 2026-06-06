"use client";

import { useState, useTransition } from "react";
import type { TenantDetail } from "@/lib/super-admin-data";
import type { BillingRule } from "@/lib/pricing";
import {
  PageHeader,
  SectionRule,
  FormField,
  TextInput,
  Select,
  Button,
} from "@/components/admin/ui";
import {
  updateTenantAction,
  addTenantAdminAction,
  removeTenantAdminAction,
} from "../../actions";

const PRODUCT_DOMAIN = "lease-order.kensetsu-tech.com";

export default function TenantDetailView({ tenant }: { tenant: TenantDetail }) {
  const [name, setName] = useState(tenant.name);
  const [billingType, setBillingType] = useState<"monthly" | "daily">(
    tenant.billing_rule.type === "daily" ? "daily" : "monthly"
  );
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const billingRule: BillingRule = { type: billingType };
      const result = await updateTenantAction({ id: tenant.id, name, billingRule });
      if (result.ok) showToast("保存しました");
      else setError(result.error);
    });
  };

  const handleAddAdmin = (formData: FormData) => {
    void formData;
    setError(null);
    startTransition(async () => {
      const result = await addTenantAdminAction(tenant.id, newAdminEmail);
      if (result.ok) {
        setNewAdminEmail("");
        showToast("管理者を招待しました");
      } else {
        setError(result.error);
      }
    });
  };

  const handleRemoveAdmin = (adminUserId: string, email: string) => {
    if (!confirm(`${email} を ${tenant.name} の管理者から削除しますか？`)) return;
    startTransition(async () => {
      const result = await removeTenantAdminAction(tenant.id, adminUserId);
      if (result.ok) showToast("削除しました");
      else showToast(result.error);
    });
  };

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/"
        backLabel="テナント一覧"
        eyebrow={`${tenant.slug}.${PRODUCT_DOMAIN}`}
        title={tenant.name}
        description={`顧客 ${tenant.customerCount} 社 ・ 注文 ${tenant.orderCount} 件 ・ 作成 ${new Date(
          tenant.created_at
        ).toLocaleDateString("ja-JP")}`}
      />

      {/* 基本情報 */}
      <section className="mb-10">
        <SectionRule label="基本情報" className="mb-4" />
        <div className="space-y-5 max-w-lg">
          <FormField label="テナント名" htmlFor="name" required>
            <TextInput
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField
            label="slug（変更不可）"
            htmlFor="slug"
            hint="サブドメインは作成後に変更できません。"
          >
            <TextInput
              id="slug"
              value={tenant.slug}
              disabled
              className="font-[family-name:var(--font-mono)]"
            />
          </FormField>
          <FormField label="課金ルール" htmlFor="billing">
            <Select
              id="billing"
              value={billingType}
              onChange={(e) =>
                setBillingType(e.target.value as "monthly" | "daily")
              }
            >
              <option value="monthly">月額</option>
              <option value="daily">日額</option>
            </Select>
          </FormField>
          <Button
            type="button"
            size="md"
            onClick={handleSave}
            disabled={isPending || !name.trim()}
          >
            {isPending ? "保存中…" : "変更を保存"}
          </Button>
        </div>
      </section>

      {/* 管理者 */}
      <section>
        <SectionRule
          label="管理者"
          right={
            <span className="font-[family-name:var(--font-mono)] tabular-nums text-[11px] text-subtle">
              {tenant.admins.length} 名
            </span>
          }
          className="mb-4"
        />
        <p className="text-xs text-muted mb-3 leading-relaxed">
          招待されたメールは <span className="font-[family-name:var(--font-mono)]">{tenant.slug}.{PRODUCT_DOMAIN}/admin</span> からマジックリンクでサインインできます。
        </p>

        <form action={handleAddAdmin} className="flex gap-2 mb-4">
          <TextInput
            type="email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            placeholder="admin@example.com"
            required
            className="flex-1 font-[family-name:var(--font-mono)]"
          />
          <Button type="submit" size="md" disabled={isPending || !newAdminEmail.trim()}>
            {isPending ? "招待中…" : "+ 招待"}
          </Button>
        </form>

        {error && (
          <p className="mb-3 text-sm text-[var(--color-status-rejected-fg)]">
            {error}
          </p>
        )}

        {tenant.admins.length === 0 ? (
          <p className="text-sm text-subtle border-y border-rule px-4 py-8 text-center">
            管理者がいません。最初の管理者を招待してください。
          </p>
        ) : (
          <div className="border-y border-rule divide-y divide-rule">
            {tenant.admins.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-foreground truncate font-[family-name:var(--font-mono)]">
                    {a.email}
                  </span>
                  <p className="font-[family-name:var(--font-mono)] text-[10px] text-subtle mt-0.5 uppercase tracking-wider">
                    招待 {new Date(a.created_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveAdmin(a.id, a.email)}
                  disabled={isPending}
                >
                  削除
                </Button>
              </div>
            ))}
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">{toast}</p>
          </div>
        </div>
      )}
    </main>
  );
}
