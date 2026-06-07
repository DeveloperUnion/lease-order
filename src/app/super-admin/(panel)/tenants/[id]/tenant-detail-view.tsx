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
  convertTenantToActiveAction,
  extendTrialAction,
  suspendTenantAction,
} from "../../actions";
import TrialBadge from "../../trial-badge";

export default function TenantDetailView({
  tenant,
  baseDomain,
}: {
  tenant: TenantDetail;
  baseDomain: string;
}) {
  const [name, setName] = useState(tenant.name);
  const [billingType, setBillingType] = useState<"monthly" | "daily">(
    tenant.billing_rule.type === "daily" ? "daily" : "monthly"
  );
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [issued, setIssued] = useState<{
    email: string;
    password: string;
    emailSent: boolean;
  } | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const handleExtend = () => {
    const days = Number(extendDays);
    if (!Number.isFinite(days) || days <= 0) {
      setError("延長日数は1以上で指定してください");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await extendTrialAction(tenant.id, days);
      if (result.ok) showToast(`${days}日延長しました`);
      else setError(result.error);
    });
  };

  const handleConvert = () => {
    if (!confirm(`${tenant.name} を本契約に切り替えますか？（以後ロックされません）`)) return;
    setError(null);
    startTransition(async () => {
      const result = await convertTenantToActiveAction(tenant.id);
      if (result.ok) showToast("本契約に切り替えました");
      else setError(result.error);
    });
  };

  const handleSuspend = () => {
    if (!confirm(`${tenant.name} を今すぐ停止しますか？（即座に完全ロックされます）`)) return;
    setError(null);
    startTransition(async () => {
      const result = await suspendTenantAction(tenant.id);
      if (result.ok) showToast("停止しました");
      else setError(result.error);
    });
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
        setIssued({
          email: result.email,
          password: result.tempPassword,
          emailSent: result.emailSent,
        });
        showToast(
          result.emailSent ? "招待メールを送信しました" : "管理者を招待しました"
        );
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
        eyebrow={`${tenant.slug}.${baseDomain}`}
        title={tenant.name}
        description={`顧客 ${tenant.customerCount} 社 ・ 注文 ${tenant.orderCount} 件 ・ 作成 ${new Date(
          tenant.created_at
        ).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`}
      />

      {/* 契約状態（トライアル / 本契約 / 停止） */}
      <section className="mb-10">
        <SectionRule label="契約状態" className="mb-4" />
        <div className="border border-rule bg-surface px-4 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <TrialBadge display={tenant.statusDisplay} />
            {tenant.status === "trial" && tenant.trial_ends_at && (
              <span className="text-sm text-muted">
                期限{" "}
                <span className="font-[family-name:var(--font-mono)] text-foreground">
                  {new Date(tenant.trial_ends_at).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-end gap-2 flex-wrap mt-4">
            <FormField label="延長日数" htmlFor="extend" className="w-28">
              <TextInput
                id="extend"
                type="number"
                min={1}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="font-[family-name:var(--font-mono)]"
              />
            </FormField>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleExtend}
              disabled={isPending}
            >
              延長
            </Button>
            <Button
              type="button"
              size="md"
              onClick={handleConvert}
              disabled={isPending || tenant.status === "active"}
            >
              本契約に切り替え
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={handleSuspend}
              disabled={isPending || tenant.status === "suspended"}
            >
              停止
            </Button>
          </div>
          <p className="text-xs text-subtle mt-3 leading-relaxed">
            延長: 期限（切れていれば現在）から指定日数を加算しトライアルを継続します。
            本契約: 以後ロックされません。停止: 即座に完全ロックします。
          </p>
        </div>
      </section>

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
          招待すると、本人宛に初期パスワードとログイン案内メールが送信されます。管理者は{" "}
          <span className="font-[family-name:var(--font-mono)]">{tenant.slug}.{baseDomain}/admin</span>{" "}
          からメールアドレスと初期パスワードでサインインします（初回サインイン後に変更が必要）。
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

        {issued && (
          <div className="mb-4 border border-[var(--color-status-approved-fg)]/30 bg-[var(--color-status-approved-bg)] px-4 py-3">
            <p className="text-sm text-foreground font-medium mb-1">
              {issued.emailSent
                ? "招待メールを送信しました"
                : "初期パスワードを発行しました"}
            </p>
            <p className="text-xs text-muted leading-relaxed mb-2">
              {issued.emailSent
                ? "本人宛に初期パスワードとログイン案内を送信しました。下記は控えです（この画面でのみ表示）。初回サインイン後に変更が必要です。"
                : "メールは未送信です（送信未構成）。下記を本人に安全に共有してください。初回サインイン後に変更が必要です。"}
            </p>
            <div className="font-[family-name:var(--font-mono)] text-sm text-foreground break-all">
              <span className="text-subtle">{issued.email}</span>
              {" / "}
              <span className="select-all">{issued.password}</span>
            </div>
          </div>
        )}

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
                    招待 {new Date(a.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
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
