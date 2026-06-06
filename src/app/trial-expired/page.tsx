import { adminFontVariables } from "@/lib/admin-fonts";

export const dynamic = "force-dynamic";

// トライアル期限切れ / 手動停止テナントの完全ロック画面。
// proxy が host のロック状態を見て全パスをここへ rewrite する。
// テナント文脈（getTenant）には依存しない。
export default function TrialExpiredPage() {
  return (
    <main
      className={`${adminFontVariables} flex-1 flex items-center justify-center px-4 py-16 sm:py-24 bg-background font-[family-name:var(--font-body)]`}
    >
      <div className="w-full max-w-md text-center">
        <div className="bg-surface border border-rule-strong px-8 py-10">
          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle mb-3">
            trial ended
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-foreground">
            期限が切れました
          </h1>
          <p className="text-sm text-muted mt-4 leading-relaxed">
            トライアル期間が終了しました。
            <br />
            ご利用の継続をご希望の場合は、
            <br className="sm:hidden" />
            運営までお問い合わせください。
          </p>
        </div>
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-subtle mt-6">
          contact your administrator to continue
        </p>
      </div>
    </main>
  );
}
