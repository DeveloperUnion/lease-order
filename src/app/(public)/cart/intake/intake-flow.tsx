"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryMethod, Material, Office, SpecSelectionLabel } from "@/lib/types";
import { useOptionalCart } from "@/lib/cart-context";
import { updateDraftFormFields } from "@/lib/offline/drafts";
import type { ResolvedIntake } from "@/lib/intake/types";
import {
  buildCartPrefill,
  matchSpecHints,
  type IntakeEditorRow,
} from "@/lib/intake/build-cart-prefill";

type Props =
  | {
      mode: "customer";
      tenantId: string;
      customerId: string;
      materials: Material[];
    }
  | {
      mode: "admin";
      tenantId: string;
      customerId: string;
      materials: Material[];
      offices: Office[];
      onSubmit: (args: {
        intakeDocumentId: string;
        rows: IntakeEditorRow[];
        formFields: ResolvedIntake["form_fields"];
        deliveryMethod: DeliveryMethod;
        pickupOfficeId: string;
      }) => Promise<{ ok: true; orderNumber: string } | { ok: false; error: string }>;
    };

type Step = "upload" | "uploading" | "extracting" | "review" | "failed" | "done";

function rowsFromResolved(
  resolved: ResolvedIntake,
  materialsById: Map<string, Material>
): IntakeEditorRow[] {
  return resolved.items.map((it) => {
    const material = it.material_id ? materialsById.get(it.material_id) ?? null : null;
    const selections: SpecSelectionLabel[] = material
      ? matchSpecHints(material, it.spec_hints)
      : [];
    return {
      raw: it,
      material,
      selections,
      quantity: it.quantity,
    };
  });
}

export default function IntakeFlow(props: Props) {
  const router = useRouter();
  const mode = props.mode;
  const materials = props.materials;
  // mode === "admin" 経由で narrow したくても、関数内で何度も props.foo を読む箇所が
  // あると面倒なので、admin 専用フィールドはここで取り出して非 admin 側では null/空。
  const adminOffices = props.mode === "admin" ? props.offices : [];
  const adminOnSubmit = props.mode === "admin" ? props.onSubmit : null;
  // admin モードでは CartProvider 外でマウントされるため useOptionalCart を使う。
  // customer モードでは必ず CartProvider 下で render されるので非 null になる。
  const cart = useOptionalCart();

  const materialsById = useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials]
  );

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);
  const [errorMessage, setErrorMessage] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedIntake | null>(null);
  const [rows, setRows] = useState<IntakeEditorRow[]>([]);
  const [formFields, setFormFields] = useState<ResolvedIntake["form_fields"] | null>(
    null
  );
  const [submittedOrderNumber, setSubmittedOrderNumber] = useState("");
  const [isPending, startTransition] = useTransition();

  // 管理者代行モード専用：delivery/pickup の指定と pickup office を編集できるようにする。
  // 顧客モードでは cart-form 側で同じ項目を選ぶので、ここでは扱わない。
  const [adminDeliveryMethod, setAdminDeliveryMethod] = useState<DeliveryMethod>(
    "delivery"
  );
  const [adminPickupOfficeId, setAdminPickupOfficeId] = useState("");

  function reset() {
    setStep("upload");
    setFile(null);
    setErrorMessage("");
    setDocumentId(null);
    setResolved(null);
    setRows([]);
    setFormFields(null);
  }

  async function handleUpload() {
    if (!file) {
      setErrorMessage("ファイルを選択してください");
      return;
    }
    setErrorMessage("");
    setStep("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", mode === "customer" ? "customer_self" : "admin_proxy");
      if (mode === "admin") fd.append("customerId", props.customerId);

      const upRes = await fetch("/api/intake/upload", { method: "POST", body: fd });
      const upJson = (await upRes.json()) as { ok?: boolean; documentId?: string; error?: string };
      if (!upRes.ok || !upJson.documentId) {
        throw new Error(upJson.error ?? "アップロードに失敗しました");
      }
      const docId = upJson.documentId;
      setDocumentId(docId);
      setStep("extracting");

      const exRes = await fetch("/api/intake/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const exJson = (await exRes.json()) as
        | { ok: true; resolved: ResolvedIntake }
        | { ok?: false; error?: string };
      if (!exRes.ok || !("ok" in exJson) || !exJson.ok) {
        const msg =
          ("error" in exJson && exJson.error) ||
          "AI 抽出に失敗しました。別のファイルを試すか手動入力に進んでください。";
        throw new Error(msg);
      }
      const r = exJson.resolved;
      setResolved(r);
      setFormFields(r.form_fields);
      setRows(rowsFromResolved(r, materialsById));
      // 管理者モードでは、AI が出した delivery_method を初期値にする。
      // unknown のときは安全側で 'delivery' に倒す。
      if (mode === "admin") {
        setAdminDeliveryMethod(
          r.form_fields.delivery_method === "pickup" ? "pickup" : "delivery"
        );
      }
      setStep("review");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "予期しないエラー");
      setStep("failed");
    }
  }

  function setRowMaterial(idx: number, mat: Material | null) {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const selections = mat ? matchSpecHints(mat, cur.raw.spec_hints) : [];
      next[idx] = { ...cur, material: mat, selections };
      return next;
    });
  }

  function setRowSelection(idx: number, groupId: string, optionId: string) {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur.material) return prev;
      const group = cur.material.spec_groups?.find((g) => g.id === groupId);
      const opt = group?.options.find((o) => o.id === optionId);
      if (!group || !opt) return prev;
      const others = cur.selections.filter((s) => s.spec_group_id !== groupId);
      next[idx] = {
        ...cur,
        selections: [
          ...others,
          {
            spec_group_id: groupId,
            spec_option_id: optionId,
            group_name: group.name,
            option_label: opt.label,
          },
        ],
      };
      return next;
    });
  }

  function setRowQty(idx: number, qty: number) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: Math.max(1, Math.floor(qty || 1)) };
      return next;
    });
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function setField<K extends keyof ResolvedIntake["form_fields"]>(
    key: K,
    value: ResolvedIntake["form_fields"][K]
  ) {
    setFormFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const missingItems = useMemo(() => {
    const msgs: string[] = [];
    if (!rows.length) {
      msgs.push("明細がありません");
      return msgs;
    }
    if (!formFields) return msgs;

    let unmatched = 0;
    let missingSpec = 0;
    let badQty = 0;
    for (const r of rows) {
      if (!r.material) {
        unmatched++;
        continue;
      }
      const required = r.material.spec_groups ?? [];
      for (const g of required) {
        if (!r.selections.some((s) => s.spec_group_id === g.id)) {
          missingSpec++;
          break;
        }
      }
      if (r.quantity < 1) badQty++;
    }
    if (unmatched) msgs.push(`資材未選択の行が ${unmatched} 件`);
    if (missingSpec) msgs.push(`仕様（色・サイズ等）未選択の行が ${missingSpec} 件`);
    if (badQty) msgs.push(`数量が 0 の行が ${badQty} 件`);

    if (mode === "admin") {
      if (!formFields.site_name?.trim()) msgs.push("現場名が未入力");
      if (!formFields.contact_name?.trim()) msgs.push("担当者名が未入力");
      if (!formFields.rental_start_date || !formFields.rental_end_date) {
        msgs.push("リース期間が未入力");
      } else if (formFields.rental_end_date < formFields.rental_start_date) {
        msgs.push("リース終了日が開始日より前");
      }
      if (adminDeliveryMethod === "delivery" && !formFields.delivery_address?.trim()) {
        msgs.push("配送先住所が未入力");
      }
      if (adminDeliveryMethod === "pickup" && !adminPickupOfficeId) {
        msgs.push("引取営業所が未選択");
      }
    }
    return msgs;
  }, [rows, formFields, mode, adminDeliveryMethod, adminPickupOfficeId]);
  const isReviewValid = missingItems.length === 0;

  async function handleApply() {
    if (!documentId || !formFields) return;
    setErrorMessage("");

    if (mode === "customer") {
      if (!cart) return; // customer モードでは provider 必須なので通常到達しない
      const { items: cartItems } = buildCartPrefill(rows, formFields);
      const draftId = await cart.prefillCart(cartItems);
      // intake で読み取った form fields を新しい draft に流し込む
      const pickupOfficeId = ""; // intake には office id は無いので空。UI でユーザが選び直す
      await updateDraftFormFields(draftId, {
        siteName: formFields.site_name ?? "",
        contactName: formFields.contact_name ?? "",
        phone: formFields.phone ?? "",
        note: formFields.note ?? "",
        deliveryMethod:
          formFields.delivery_method === "pickup" ? "pickup" : "delivery",
        deliveryAddress: formFields.delivery_address ?? "",
        deliveryLat: null,
        deliveryLng: null,
        pickupOfficeId,
        leaseStartDate: formFields.rental_start_date ?? "",
        leaseEndDate: formFields.rental_end_date ?? "",
      }).catch(() => {});

      const qs = new URLSearchParams({
        step: "form",
        intake: documentId,
      }).toString();
      router.push(`/cart?${qs}`);
    } else {
      // admin: server action 経由で直接 submit
      const onSubmit = adminOnSubmit;
      if (!onSubmit) return;
      startTransition(async () => {
        const result = await onSubmit({
          intakeDocumentId: documentId,
          rows,
          formFields,
          deliveryMethod: adminDeliveryMethod,
          pickupOfficeId: adminPickupOfficeId,
        });
        if (!result.ok) {
          setErrorMessage(result.error);
          return;
        }
        setSubmittedOrderNumber(result.orderNumber);
        setStep("done");
      });
    }
  }

  if (step === "done" && mode === "admin") {
    return (
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        <div className="border border-border bg-surface rounded-2xl px-6 py-10 text-center">
          <h1 className="text-xl font-bold text-foreground">代行発注を作成しました</h1>
          <p className="text-sm text-muted mt-2">
            発注番号:{" "}
            <span className="font-semibold tabular-nums">{submittedOrderNumber}</span>
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <Link
              href="/admin/orders"
              className="h-10 px-5 inline-flex items-center justify-center bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              発注一覧へ
            </Link>
            <button
              onClick={reset}
              className="h-10 px-5 inline-flex items-center justify-center border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
            >
              続けて代行発注
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-7">
      <div className="mb-4">
        <Link
          href={mode === "customer" ? "/" : "/admin/orders"}
          className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors"
        >
          <span aria-hidden>←</span> 戻る
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
        発注書から取り込み
      </h1>
      <p className="text-sm text-muted mb-6">
        紙の発注書や FAX を画像 or PDF でアップロードすると、
        AI が品目・数量・期間を読み取り、発注ドラフトを自動で作成します。
      </p>

      {step === "upload" && (
        <div className="border border-border bg-surface rounded-2xl p-6">
          <p className="text-sm font-semibold text-foreground mb-3">
            発注書ファイル
            <span className="ml-2 text-xs font-normal text-subtle">
              PDF / JPEG / PNG / WebP・10MB まで
            </span>
          </p>
          {file ? (
            <div className="border-2 border-accent bg-accent-soft/30 rounded-xl p-4">
              <div className="flex items-start gap-4">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="選択中のファイル"
                    className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg border border-border shrink-0 bg-surface"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center rounded-lg border border-border bg-surface shrink-0">
                    <span className="font-[family-name:var(--font-mono)] text-xs font-bold text-accent">
                      PDF
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded">
                    <span aria-hidden>✓</span> 選択済み
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground break-all">
                    {file.name}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <label className="mt-3 inline-flex items-center text-xs text-accent hover:underline cursor-pointer">
                    別のファイルを選ぶ
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border rounded-xl px-6 py-10 cursor-pointer hover:border-accent hover:bg-accent-soft/30 transition-colors">
              <p className="text-sm font-semibold text-foreground">
                写真を撮る / ファイルを選ぶ
              </p>
              <p className="text-xs text-subtle">
                発注書の画像 or PDF をアップロード
              </p>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
          )}
          {errorMessage && (
            <p className="mt-3 text-sm text-danger">{errorMessage}</p>
          )}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleUpload}
              disabled={!file}
              className="h-11 px-6 inline-flex items-center justify-center bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              読み取りを開始
            </button>
            <Link
              href={mode === "customer" ? "/" : "/admin/orders"}
              className="h-11 px-6 inline-flex items-center justify-center border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
            >
              手動入力に戻る
            </Link>
          </div>
        </div>
      )}

      {(step === "uploading" || step === "extracting") && (
        <div className="border border-border bg-surface rounded-2xl p-8">
          {file && (
            <p className="text-xs text-subtle text-center mb-6 break-all px-2">
              {file.name}（{(file.size / 1024 / 1024).toFixed(2)} MB）
            </p>
          )}
          <ol className="space-y-3 max-w-xs mx-auto">
            <ProgressStep
              status={step === "uploading" ? "active" : "done"}
              label="ファイルをアップロード中"
              doneLabel="アップロード完了"
            />
            <ProgressStep
              status={step === "extracting" ? "active" : "pending"}
              label="AI が発注書を読み取り中"
              pendingLabel="AI 読み取り待機中"
            />
          </ol>
          <p className="mt-6 text-center text-xs text-subtle">
            {step === "uploading"
              ? "通信状況により数秒かかります。"
              : "通常 10〜20 秒ほどで完了します。"}
          </p>
        </div>
      )}

      {step === "failed" && (
        <div className="border border-danger/30 bg-danger/5 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-danger">
            読み取りに失敗しました
          </h2>
          <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
            {errorMessage}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={reset}
              className="h-10 px-5 inline-flex items-center justify-center border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
            >
              別のファイルを試す
            </button>
            <Link
              href={mode === "customer" ? "/" : "/admin/orders"}
              className="h-10 px-5 inline-flex items-center justify-center bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              手動入力に進む
            </Link>
          </div>
        </div>
      )}

      {step === "review" && formFields && resolved && (
        <div className="space-y-6">
          <ReviewBanner resolved={resolved} />

          <Section title="発注情報（編集可）">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="現場名"
                value={formFields.site_name ?? ""}
                onChange={(v) => setField("site_name", v)}
              />
              <Field
                label="担当者名"
                value={formFields.contact_name ?? ""}
                onChange={(v) => setField("contact_name", v)}
              />
              <Field
                label="電話番号"
                value={formFields.phone ?? ""}
                onChange={(v) => setField("phone", v)}
              />
              <Field
                label="リース開始日"
                type="date"
                value={formFields.rental_start_date ?? ""}
                onChange={(v) => setField("rental_start_date", v || null)}
              />
              <Field
                label="リース終了日"
                type="date"
                value={formFields.rental_end_date ?? ""}
                onChange={(v) => setField("rental_end_date", v || null)}
              />
              <Field
                label="配送先住所（任意）"
                value={formFields.delivery_address ?? ""}
                onChange={(v) => setField("delivery_address", v)}
              />
            </div>
            {formFields.note && (
              <p className="mt-3 text-xs text-subtle">備考: {formFields.note}</p>
            )}

            {mode === "admin" && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-border">
                <label className="block">
                  <span className="text-xs text-subtle">受取方法</span>
                  <div className="mt-1 flex gap-3">
                    {(["delivery", "pickup"] as const).map((m) => (
                      <label
                        key={m}
                        className="inline-flex items-center gap-1.5 text-sm text-foreground"
                      >
                        <input
                          type="radio"
                          name="delivery-method"
                          checked={adminDeliveryMethod === m}
                          onChange={() => setAdminDeliveryMethod(m)}
                        />
                        {m === "delivery" ? "配送" : "引取"}
                      </label>
                    ))}
                  </div>
                </label>
                {adminDeliveryMethod === "pickup" && (
                  <label className="block">
                    <span className="text-xs text-subtle">
                      引取営業所
                      {formFields.pickup_office_hint && (
                        <span className="ml-1 text-warning">
                          （AI 推定: {formFields.pickup_office_hint}）
                        </span>
                      )}
                    </span>
                    <select
                      value={adminPickupOfficeId}
                      onChange={(e) => setAdminPickupOfficeId(e.target.value)}
                      className="mt-1 block w-full h-9 px-2 text-sm rounded-lg border border-border bg-surface text-foreground focus:border-accent focus:outline-none"
                    >
                      <option value="">— 選択してください —</option>
                      {adminOffices.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                          {o.area ? `（${o.area}）` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </Section>

          <Section title={`明細（${rows.length} 品目）`}>
            <div className="space-y-3">
              {rows.map((row, idx) => (
                <IntakeRow
                  key={idx}
                  row={row}
                  materials={materials}
                  onChangeMaterial={(m) => setRowMaterial(idx, m)}
                  onChangeSelection={(g, o) => setRowSelection(idx, g, o)}
                  onChangeQty={(q) => setRowQty(idx, q)}
                  onRemove={() => removeRow(idx)}
                />
              ))}
              {rows.length === 0 && (
                <p className="text-sm text-subtle">
                  明細がありません。ファイルから読み取れなかった可能性があります。
                </p>
              )}
            </div>
          </Section>

          {errorMessage && (
            <p className="text-sm text-danger">{errorMessage}</p>
          )}

          {missingItems.length > 0 && (
            <div className="border border-warning/30 bg-warning/5 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-warning mb-1.5">
                {mode === "customer" ? "カートに反映" : "代行発注を作成"}するには以下を解消してください
              </p>
              <ul className="text-xs text-foreground space-y-0.5 list-disc list-inside">
                {missingItems.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleApply}
              disabled={!isReviewValid || isPending}
              className="h-11 px-6 inline-flex items-center justify-center bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mode === "customer" ? "カートに反映" : "代行発注を作成"}
            </button>
            <button
              onClick={reset}
              className="h-11 px-6 inline-flex items-center justify-center border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
            >
              やり直す
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ProgressStep({
  status,
  label,
  doneLabel,
  pendingLabel,
}: {
  status: "pending" | "active" | "done";
  label: string;
  doneLabel?: string;
  pendingLabel?: string;
}) {
  const text =
    status === "done" ? doneLabel ?? label : status === "pending" ? pendingLabel ?? label : label;
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          status === "done"
            ? "bg-accent text-white"
            : status === "active"
            ? "bg-accent/15 text-accent"
            : "bg-surface-muted text-subtle"
        }`}
      >
        {status === "done" ? "✓" : status === "active" ? (
          <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        ) : "·"}
      </span>
      <span
        className={`text-sm ${
          status === "done"
            ? "text-foreground"
            : status === "active"
            ? "text-foreground font-semibold"
            : "text-subtle"
        }`}
      >
        {text}
      </span>
    </li>
  );
}

function ReviewBanner({ resolved }: { resolved: ResolvedIntake }) {
  const lowConf = resolved.overall_confidence < 0.6;
  return (
    <div
      className={`border rounded-xl px-4 py-3 text-xs ${
        lowConf
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-border bg-surface-muted text-muted"
      }`}
    >
      <p>
        AI 自信度: <strong>{Math.round(resolved.overall_confidence * 100)}%</strong>
      </p>
      {resolved.overall_notes && (
        <p className="mt-1 whitespace-pre-wrap">{resolved.overall_notes}</p>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-surface rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-subtle">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full h-9 px-3 text-sm rounded-lg border border-border bg-surface text-foreground focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function IntakeRow({
  row,
  materials,
  onChangeMaterial,
  onChangeSelection,
  onChangeQty,
  onRemove,
}: {
  row: IntakeEditorRow;
  materials: Material[];
  onChangeMaterial: (m: Material | null) => void;
  onChangeSelection: (groupId: string, optionId: string) => void;
  onChangeQty: (q: number) => void;
  onRemove: () => void;
}) {
  const confidencePct = Math.round(row.raw.confidence * 100);
  const unmatched = !row.material;
  return (
    <div
      className={`border rounded-xl p-4 ${
        unmatched ? "border-warning/40 bg-warning/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-subtle">原文</p>
          <p className="text-sm text-foreground truncate">{row.raw.material_name_raw}</p>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            row.raw.confidence >= 0.8
              ? "bg-accent-soft text-accent-ink"
              : "bg-warning/20 text-warning"
          }`}
        >
          {confidencePct}%
        </span>
        <button
          onClick={onRemove}
          aria-label="この行を削除"
          className="text-subtle hover:text-danger text-xs"
        >
          削除
        </button>
      </div>

      <label className="block mb-3">
        <span className="text-xs text-subtle">資材</span>
        <select
          value={row.material?.id ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChangeMaterial(v ? materials.find((m) => m.id === v) ?? null : null);
          }}
          className={`mt-1 block w-full h-9 px-2 text-sm rounded-lg border bg-surface text-foreground focus:outline-none ${
            unmatched
              ? "border-warning focus:border-warning"
              : "border-border focus:border-accent"
          }`}
        >
          <option value="">— 選択してください —</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {row.material?.spec_groups?.map((group) => {
        const cur = row.selections.find((s) => s.spec_group_id === group.id);
        return (
          <label key={group.id} className="block mb-2">
            <span className="text-xs text-subtle">{group.name}</span>
            <select
              value={cur?.spec_option_id ?? ""}
              onChange={(e) => onChangeSelection(group.id, e.target.value)}
              className="mt-1 block w-full h-9 px-2 text-sm rounded-lg border border-border bg-surface text-foreground focus:border-accent focus:outline-none"
            >
              <option value="">— 選択してください —</option>
              {group.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      <div className="flex items-center gap-3">
        <label className="block">
          <span className="text-xs text-subtle">数量</span>
          <input
            type="number"
            min={1}
            value={row.quantity}
            onChange={(e) => onChangeQty(Number(e.target.value))}
            className="mt-1 block w-24 h-9 px-2 text-sm rounded-lg border border-border bg-surface text-foreground tabular-nums focus:border-accent focus:outline-none"
          />
        </label>
        {row.raw.note && (
          <p className="text-xs text-subtle mt-4 flex-1">{row.raw.note}</p>
        )}
      </div>
    </div>
  );
}
