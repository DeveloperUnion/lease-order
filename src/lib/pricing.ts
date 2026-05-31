// レンタル料金の計算。単価（資材ごと）と課金ルール（テナントごと）を分離し、
// リース日数からの積算をこの 1 ファイルに閉じ込める。
//
// - 単価   : materials.daily_price / monthly_price（円・税抜・nullable）
// - ルール : tenants.billing_rule (jsonb)
// - 日数   : orders.lease_start_date 〜 lease_end_date

export type PriceUnit = "day" | "month";

export type BillingRule =
  | { type: "daily" }
  | { type: "monthly" }
  | {
      type: "threshold";
      threshold_days: number;
      under: PriceUnit;
      over: PriceUnit;
    };

export type Rates = {
  daily_price: number | null;
  monthly_price: number | null;
};

export type LineCharge = {
  unit: PriceUnit;
  unitPrice: number;
  billedUnits: number; // 課金された日数 or 月数
  amount: number; // unitPrice * billedUnits * quantity
};

/** 月数算定の基準日数（MVP。将来カレンダー月にするならここを差し替える）。 */
const DAYS_PER_MONTH = 30;

/** ISO 日付文字列（YYYY-MM-DD）を UTC の epoch 日に変換。 */
function toEpochDay(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

/**
 * リース日数（両端含む）。賃貸慣行に合わせ開始日・終了日の両方を 1 日として数える。
 * 不正な日付や end < start の場合は 0。
 */
export function leaseDays(startIso: string, endIso: string): number {
  const start = toEpochDay(startIso);
  const end = toEpochDay(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return end - start + 1;
}

/** 課金ルールと日数から、その注文に適用する単位（日 or 月）を決める。 */
export function resolveUnit(rule: BillingRule, days: number): PriceUnit {
  switch (rule.type) {
    case "daily":
      return "day";
    case "monthly":
      return "month";
    case "threshold":
      return days >= rule.threshold_days ? rule.over : rule.under;
  }
}

/** 単位ごとの課金数量（日→日数、月→ceil(日数/30)。最低 1）。 */
export function billedUnits(unit: PriceUnit, days: number): number {
  if (days <= 0) return 0;
  if (unit === "day") return days;
  return Math.max(1, Math.ceil(days / DAYS_PER_MONTH));
}

/** 単位に対応する単価を取り出す。 */
function rateFor(unit: PriceUnit, rates: Rates): number | null {
  return unit === "day" ? rates.daily_price : rates.monthly_price;
}

/**
 * 明細 1 行の料金を算出。必要な単価が未設定（null）なら null を返す（価格未設定）。
 * days <= 0 でも null（期間未確定）。
 */
export function calcLine(
  rule: BillingRule,
  rates: Rates,
  days: number,
  quantity: number
): LineCharge | null {
  if (days <= 0 || quantity <= 0) return null;
  const unit = resolveUnit(rule, days);
  const unitPrice = rateFor(unit, rates);
  if (unitPrice == null) return null;
  const units = billedUnits(unit, days);
  return {
    unit,
    unitPrice,
    billedUnits: units,
    amount: unitPrice * units * quantity,
  };
}

/** 円表記。null は「価格未設定」。 */
export function formatYen(n: number | null | undefined): string {
  if (n == null) return "価格未設定";
  return `¥${n.toLocaleString("ja-JP")}`;
}

export const UNIT_LABEL: Record<PriceUnit, string> = {
  day: "日額",
  month: "月額",
};

/**
 * 期間が未確定な場面（資材モーダル等）で見せる単価の一覧。
 * threshold ルールは「N日未満は日額 / N日以上は月額」を 2 行で返す。
 */
export function priceLines(
  rule: BillingRule,
  rates: Rates
): { label: string; price: number | null }[] {
  const priceOf = (u: PriceUnit) =>
    u === "day" ? rates.daily_price : rates.monthly_price;
  switch (rule.type) {
    case "daily":
      return [{ label: UNIT_LABEL.day, price: rates.daily_price }];
    case "monthly":
      return [{ label: UNIT_LABEL.month, price: rates.monthly_price }];
    case "threshold":
      return [
        {
          label: `${rule.threshold_days}日未満 ${UNIT_LABEL[rule.under]}`,
          price: priceOf(rule.under),
        },
        {
          label: `${rule.threshold_days}日以上 ${UNIT_LABEL[rule.over]}`,
          price: priceOf(rule.over),
        },
      ];
  }
}
