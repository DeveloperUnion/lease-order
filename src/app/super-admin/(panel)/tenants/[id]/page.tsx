import { notFound } from "next/navigation";
import { getTenantDetail } from "@/lib/super-admin-data";
import { getTenantBaseDomain } from "@/lib/tenant";
import TenantDetailView from "./tenant-detail-view";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tenant, baseDomain] = await Promise.all([
    getTenantDetail(id),
    getTenantBaseDomain(),
  ]);
  if (!tenant) notFound();

  return <TenantDetailView tenant={tenant} baseDomain={baseDomain} />;
}
