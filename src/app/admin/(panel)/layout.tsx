import { redirect } from "next/navigation";
import {
  getNotificationBellData,
  getSidebarData,
} from "@/lib/admin-shell-data";
import { getTenantSlug } from "@/lib/tenant";
import { currentAdminMustChangePassword } from "@/lib/current-admin";
import { adminFontVariables } from "@/lib/admin-fonts";
import AdminShell from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 認証チェックは proxy で済んでいる。初回パスワード変更が必要な管理者は
  // 専用ページ（(panel) 外なのでループしない）へ誘導する。
  if (await currentAdminMustChangePassword()) {
    redirect("/admin/change-password");
  }
  // layout は tenant slug の解決だけ即座に行い、sidebar / 通知ベルのデータ取得は
  // await せずに promise のまま AdminShell へ渡す。
  // AdminShell 内の <Suspense> + use() で個別にストリーミング描画される。
  const tenantSlug = await getTenantSlug();
  const sidebarPromise = getSidebarData();
  const notificationPromise = getNotificationBellData();

  return (
    <div
      data-tenant={tenantSlug}
      className={`${adminFontVariables} fixed inset-0 flex overflow-hidden bg-surface-muted font-[family-name:var(--font-body)]`}
    >
      <AdminShell
        sidebarPromise={sidebarPromise}
        notificationPromise={notificationPromise}
      >
        {children}
      </AdminShell>
    </div>
  );
}
