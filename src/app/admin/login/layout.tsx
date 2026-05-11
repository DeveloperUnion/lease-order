import { getTenantSlug } from "@/lib/tenant";
import { adminFontVariables } from "@/lib/admin-fonts";

export const dynamic = "force-dynamic";

export default async function AdminLoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantSlug = await getTenantSlug();
  return (
    <div
      data-tenant={tenantSlug}
      className={`${adminFontVariables} flex flex-1 flex-col font-[family-name:var(--font-body)]`}
    >
      {children}
    </div>
  );
}
