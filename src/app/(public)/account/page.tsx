import { requireCustomer } from "@/lib/customer-auth";
import ProfileForm from "./profile-form";
import PasswordForm from "./password-form";
import EmailSection from "./email-section";
import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const customer = await requireCustomer({ allowMustChangePassword: true });
  const sp = await searchParams;
  const showResetBanner = customer.must_change_password || sp.reset === "1";

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-7">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">マイページ</h1>

      {showResetBanner && (
        <div className="mt-6 bg-warning-soft border border-warning/30 rounded-xl px-5 py-4">
          <p className="text-sm font-bold text-warning">
            初回ログイン: パスワード変更が必要です
          </p>
          <p className="text-xs text-warning/80 mt-1">
            セキュリティのため、パスワードを変更するまで他のページは利用できません。
          </p>
        </div>
      )}

      <Section label="会社情報">
        <dl className="border-t border-border">
          <Row label="会社 ID" value={customer.company_id} />
          <Row label="会社名" value={customer.name} />
        </dl>
        <p className="text-xs text-subtle mt-3">
          会社 ID と会社名はリース会社が管理します。変更が必要な場合は担当者にご連絡ください。
        </p>
      </Section>

      <Section
        label="パスワード変更"
        emphasis={showResetBanner ? "warning" : undefined}
      >
        <PasswordForm mustChange={showResetBanner} />
      </Section>

      <Section label="通知メール">
        <EmailSection
          initialEmail={customer.contact_email ?? ""}
          initialVerified={customer.email_verified}
        />
      </Section>

      <Section label="連絡先情報">
        <ProfileForm
          initialPhone={customer.phone ?? ""}
          initialDefaultAddress={customer.default_address ?? ""}
        />
      </Section>

      <Section label="ログアウト">
        <LogoutButton />
      </Section>
    </main>
  );
}

function Section({
  label,
  emphasis,
  children,
}: {
  label: string;
  emphasis?: "warning";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2
        className={`text-base font-semibold pb-2 border-b ${
          emphasis === "warning"
            ? "text-warning border-warning/40"
            : "text-foreground border-border"
        }`}
      >
        {label}
      </h2>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-border">
      <dt className="text-xs text-subtle min-w-[6rem]">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
