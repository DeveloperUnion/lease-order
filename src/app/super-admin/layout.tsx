import { adminFontVariables } from "@/lib/admin-fonts";

export const dynamic = "force-dynamic";

// 運営者(super-admin)コンソール全体のフォント変数ラッパー。
// 認証は proxy（superAdminProxy）で済んでおり、ここでは何も解決しない。
// テナント文脈を一切持たない（getTenant を呼ばない）のが分離の肝。
export default function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      data-surface="super-admin"
      className={`${adminFontVariables} flex flex-1 flex-col font-[family-name:var(--font-body)]`}
    >
      {children}
    </div>
  );
}
