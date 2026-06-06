// テナントの契約状態（トライアル / 本契約 / 停止）の表示算出。
// 純粋関数のみ（"server-only" を付けず client からも import 可）。
// 時刻依存（残り日数）は呼び出し側が nowMs を渡す形にして、React の
// render 中に Date.now() を直接呼ばない（react-hooks/purity 対応）。

export type TenantStatus = "trial" | "active" | "suspended";
export type TrialTone = "trial" | "expired" | "suspended" | "active";

const DAY_MS = 24 * 60 * 60 * 1000;

export type TenantStatusDisplay = { label: string; tone: TrialTone };

export function tenantStatusDisplay(
  status: TenantStatus,
  trialEndsAt: string | null,
  nowMs: number
): TenantStatusDisplay {
  if (status === "suspended") return { label: "停止中", tone: "suspended" };
  if (status === "trial") {
    if (!trialEndsAt) return { label: "トライアル", tone: "trial" };
    const diff = new Date(trialEndsAt).getTime() - nowMs;
    if (diff < 0) return { label: "期限切れ", tone: "expired" };
    const days = Math.ceil(diff / DAY_MS);
    return { label: `トライアル 残り${days}日`, tone: "trial" };
  }
  return { label: "本契約", tone: "active" };
}
