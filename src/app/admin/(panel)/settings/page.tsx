import { getTenant } from "@/lib/tenant";
import SettingsView from "./settings-view";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const tenant = await getTenant();
  return (
    <SettingsView
      initialMode={tenant.customer_access_mode}
      initialSelfRegistration={tenant.customer_self_registration}
    />
  );
}
