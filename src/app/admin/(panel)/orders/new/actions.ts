"use server";

import { submitOrderCore, type SubmitOrderInput } from "@/lib/order-submission";
import { getTenantId } from "@/lib/tenant";
import { currentAdminUserId } from "@/lib/current-admin";

// 管理者代行で発注を作成する。
// 呼び出し元（intake-flow）は items / formFields / intakeDocumentId をクライアントで
// 持っているので、それを SubmitOrderInput に整形してから submitOrderCore へ渡す。
export async function submitProxyOrder(args: {
  customerId: string;
  intakeDocumentId: string;
  payload: SubmitOrderInput;
}): Promise<{ ok: true; orderNumber: string } | { ok: false; error: string }> {
  const tenantId = await getTenantId();
  const adminId = await currentAdminUserId(tenantId);
  if (!adminId) return { ok: false, error: "管理者認証が必要です" };

  const clientRequestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const result = await submitOrderCore(args.payload, clientRequestId, {
    actingAs: { customerId: args.customerId, adminId },
    intakeDocumentId: args.intakeDocumentId,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, orderNumber: result.orderNumber };
}
