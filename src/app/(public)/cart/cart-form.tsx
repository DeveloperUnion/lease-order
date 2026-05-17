"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import type { CustomerSession } from "@/lib/customer-auth";
import type { DeliveryMethod, Office } from "@/lib/types";
import AddressAutocomplete from "./address-autocomplete";
import MapPicker, { type LatLng } from "@/components/map/map-picker";
import {
  getDraft,
  updateDraftFormFields,
  deleteDraft,
} from "@/lib/offline/drafts";
import { enqueue, flushOne, removeItem as removeOutboxItem } from "@/lib/offline/outbox";
import type { SubmitOrderInput } from "@/lib/order-submission";

type Props = { offices: Office[]; customer: CustomerSession };

type Step = "cart" | "form" | "done" | "queued";

const STEPS: { key: Step; label: string }[] = [
  { key: "cart", label: "カート" },
  { key: "form", label: "発注情報" },
  { key: "done", label: "完了" },
];

function StepProgress({ active }: { active: Step }) {
  // 'queued' は 'done' と同じ進捗位置で表示する
  const lookup = active === "queued" ? "done" : active;
  const activeIdx = STEPS.findIndex((s) => s.key === lookup);
  return (
    <ol className="flex items-center gap-3 mb-8">
      {STEPS.map((s, i) => {
        const state =
          i < activeIdx ? "done" : i === activeIdx ? "current" : "upcoming";
        return (
          <li key={s.key} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 flex-1">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold tabular-nums ${
                  state === "current"
                    ? "bg-accent text-accent-ink"
                    : state === "done"
                    ? "bg-accent/80 text-accent-ink"
                    : "bg-surface border border-border text-subtle"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-xs font-medium ${
                  state === "upcoming" ? "text-subtle" : "text-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className={`flex-1 h-px ${
                  i < activeIdx ? "bg-accent" : "bg-border"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function CartForm({ offices, customer }: Props) {
  const {
    items,
    updateQuantity,
    removeItem,
    activeDraftId,
    startNewDraft,
  } = useCart();
  const [step, setStep] = useState<Step>("cart");
  const [siteName, setSiteName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [note, setNote] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState(customer.default_address ?? "");
  const [deliveryLocation, setDeliveryLocation] = useState<LatLng | null>(null);
  const [pickupOfficeId, setPickupOfficeId] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [formLoaded, setFormLoaded] = useState(false);
  const loadedDraftIdRef = useRef<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // active draft が変わったら下書きから form fields をシード
  useEffect(() => {
    if (!activeDraftId) return;
    if (loadedDraftIdRef.current === activeDraftId) return;
    let cancelled = false;
    setFormLoaded(false);
    (async () => {
      const d = await getDraft(activeDraftId);
      if (cancelled || !d) return;
      const f = d.formFields;
      if (f.siteName) setSiteName(f.siteName);
      if (f.contactName) setContactName(f.contactName);
      if (f.phone) setPhone(f.phone);
      if (f.note) setNote(f.note);
      if (f.deliveryMethod) setDeliveryMethod(f.deliveryMethod);
      if (f.deliveryAddress) setDeliveryAddress(f.deliveryAddress);
      if (f.deliveryLat != null && f.deliveryLng != null) {
        setDeliveryLocation({ lat: f.deliveryLat, lng: f.deliveryLng });
      }
      if (f.pickupOfficeId) setPickupOfficeId(f.pickupOfficeId);
      if (f.leaseStartDate) setLeaseStartDate(f.leaseStartDate);
      if (f.leaseEndDate) setLeaseEndDate(f.leaseEndDate);
      loadedDraftIdRef.current = activeDraftId;
      setFormLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDraftId]);

  // form fields を debounce で active draft に保存
  useEffect(() => {
    if (!formLoaded || !activeDraftId) return;
    const t = setTimeout(() => {
      updateDraftFormFields(activeDraftId, {
        siteName,
        contactName,
        phone,
        note,
        deliveryMethod,
        deliveryAddress,
        deliveryLat: deliveryLocation?.lat ?? null,
        deliveryLng: deliveryLocation?.lng ?? null,
        pickupOfficeId,
        leaseStartDate,
        leaseEndDate,
      }).catch(() => {
        /* offline write best-effort */
      });
    }, 500);
    return () => clearTimeout(t);
  }, [
    formLoaded,
    activeDraftId,
    siteName,
    contactName,
    phone,
    note,
    deliveryMethod,
    deliveryAddress,
    deliveryLocation,
    pickupOfficeId,
    leaseStartDate,
    leaseEndDate,
  ]);

  const officesByArea = offices.reduce<Record<string, Office[]>>((acc, o) => {
    const key = o.area ?? "その他";
    (acc[key] ??= []).push(o);
    return acc;
  }, {});
  const areaOrder = Array.from(
    new Set(offices.map((o) => o.area ?? "その他"))
  );
  const selectedOffice = offices.find((o) => o.id === pickupOfficeId);

  const isFormValid = (() => {
    if (!siteName.trim() || !contactName.trim()) return false;
    if (!leaseStartDate || !leaseEndDate) return false;
    if (leaseEndDate < leaseStartDate) return false;
    if (deliveryMethod === "delivery" && !deliveryAddress.trim()) return false;
    if (deliveryMethod === "pickup" && !pickupOfficeId) return false;
    return true;
  })();

  const handleSubmit = () => {
    if (!isFormValid) return;
    setErrorMessage("");

    const payload: SubmitOrderInput = {
      siteName,
      contactName,
      phone,
      note,
      deliveryMethod,
      deliveryAddress: deliveryMethod === "delivery" ? deliveryAddress : "",
      deliveryLat:
        deliveryMethod === "delivery" ? deliveryLocation?.lat ?? null : null,
      deliveryLng:
        deliveryMethod === "delivery" ? deliveryLocation?.lng ?? null : null,
      pickupOfficeId: deliveryMethod === "pickup" ? pickupOfficeId : "",
      leaseStartDate,
      leaseEndDate,
      items: items.map((i) => ({
        materialId: i.material.id,
        quantity: i.quantity,
        selections: i.selections.map((s) => ({
          spec_group_id: s.spec_group_id,
          spec_option_id: s.spec_option_id,
          group_name: s.group_name,
          option_label: s.option_label,
        })),
      })),
    };

    startTransition(async () => {
      const consumedDraftId = activeDraftId;

      // 1. まず outbox にキュー登録（ここで client_request_id を発行）。
      //    以降のネットワーク失敗・タブクラッシュなどでも復旧できる。
      const item = await enqueue({
        tenantId: customer.tenant_id,
        customerId: customer.id,
        payload,
      });

      // 2. オンラインなら即時送信を試みる。オフラインならスキップして
      //    "送信予約" 画面を出し、sync-runner に任せる。
      const result = isOnline
        ? await flushOne(item.id, 12_000)
        : ({ status: "pending", reason: "network" } as const);

      if (result.status === "failed") {
        // サーバ側で 4xx 拒否（入力不備など）。
        // outbox は再送しても無駄なので除去し、下書きは温存して
        // ユーザに修正のチャンスを残す。
        await removeOutboxItem(item.id);
        setErrorMessage(result.error);
        return;
      }

      // 送信成功 or 送信予約 → 下書きを消費して新規 draft に切替
      await startNewDraft();
      if (consumedDraftId) {
        await deleteDraft(consumedDraftId).catch(() => {});
      }

      if (result.status === "sent") {
        setOrderNumber(result.orderNumber);
        setStep("done");
      } else {
        // pending: 圏外 or タイムアウト or サーバ 5xx
        setStep("queued");
      }
    });
  };

  if (step === "queued") {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <StepProgress active="queued" />

        <div className="border border-border bg-surface rounded-2xl overflow-hidden">
          <div className="px-6 py-8 sm:py-10 text-center border-b border-border bg-accent-soft">
            <span className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-full">
              <svg className="h-6 w-6 text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h1 className="mt-5 text-xl font-bold text-foreground">送信予約しました</h1>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              {isOnline
                ? "サーバへの送信が完了しなかったため、送信待ちに保存しました。"
                : "オフラインのため送信待ちに保存しました。"}
              <br />
              圏内になれば自動的に送信されます。
            </p>
          </div>
          <div className="px-6 py-5 text-xs text-subtle leading-relaxed">
            <p>
              送信状態は「送信待ち一覧」でいつでも確認・再送できます。
              この端末から離れる前に、念のため一度オンラインで開き直すことを推奨します。
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/outbox"
            className="flex-1 h-12 inline-flex items-center justify-center gap-2 border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
          >
            送信待ち一覧
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/"
            className="flex-1 h-12 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            発注画面に戻る
            <span aria-hidden>→</span>
          </Link>
        </div>
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <StepProgress active="done" />

        <div className="border border-border bg-surface rounded-2xl overflow-hidden">
          <div className="px-6 py-8 sm:py-10 text-center border-b border-border bg-accent-soft">
            <span className="inline-flex items-center justify-center w-12 h-12 bg-accent rounded-full">
              <svg className="h-6 w-6 text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <h1 className="mt-5 text-xl font-bold text-foreground">発注を受け付けました</h1>
            <p className="text-sm text-muted mt-1">担当者より確認のご連絡をいたします。</p>
          </div>
          <dl className="px-6 py-5">
            <div className="flex items-baseline gap-4 py-2 border-b border-border">
              <dt className="text-xs text-subtle min-w-[7rem]">
                発注番号
              </dt>
              <dd className="text-base font-semibold text-foreground tabular-nums">{orderNumber}</dd>
            </div>
            <div className="flex items-baseline gap-4 py-2">
              <dt className="text-xs text-subtle min-w-[7rem]">
                状態
              </dt>
              <dd className="text-sm text-foreground">承認待ち</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/orders"
            className="flex-1 h-12 inline-flex items-center justify-center gap-2 border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted transition-colors"
          >
            発注履歴を見る
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/"
            className="flex-1 h-12 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            発注画面に戻る
            <span aria-hidden>→</span>
          </Link>
        </div>
      </main>
    );
  }

  if (items.length === 0 && step === "cart") {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <StepProgress active="cart" />
        <div className="border border-border bg-surface rounded-2xl py-16 px-6 text-center">
          <p className="text-sm text-muted">カートに資材がありません</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center gap-2 px-6 h-10 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            資材を探す
            <span aria-hidden>→</span>
          </Link>
          <div className="mt-4">
            <Link
              href="/drafts"
              className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors"
            >
              下書き一覧を見る
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-7">
      <StepProgress active={step} />

      {step === "cart" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors"
            >
              <span aria-hidden>←</span> 発注画面に戻る
            </Link>
            <Link
              href="/drafts"
              className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors"
            >
              下書き一覧 <span aria-hidden>→</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-6">カート</h1>

          <div className="border border-border bg-surface rounded-xl overflow-hidden mb-6">
            {items.map((item) => {
              const selectionText = item.selections.length > 0
                ? item.selections.map((s) => `${s.group_name}: ${s.option_label}`).join("  /  ")
                : item.material.spec && Object.keys(item.material.spec).length > 0
                ? Object.entries(item.material.spec)
                    .slice(0, 2)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("  /  ")
                : null;
              return (
                <div
                  key={item.cartLineId}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {item.material.name}
                    </p>
                    {selectionText && (
                      <p className="text-xs text-subtle mt-0.5 truncate">{selectionText}</p>
                    )}
                  </div>
                  <div className="inline-flex items-stretch border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.cartLineId, Math.max(1, item.quantity - 1))}
                      aria-label="数量を減らす"
                      className="w-8 inline-flex items-center justify-center text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M5 12h14" /></svg>
                    </button>
                    <span className="w-9 text-center self-center text-sm font-semibold text-foreground border-x border-border h-8 leading-8 tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.cartLineId, item.quantity + 1)}
                      aria-label="数量を増やす"
                      className="w-8 inline-flex items-center justify-center text-muted hover:bg-surface-muted hover:text-foreground transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.cartLineId)}
                    aria-label="削除"
                    className="ml-1 inline-flex items-center justify-center w-8 h-8 rounded-lg text-subtle hover:bg-surface-muted hover:text-danger transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6h12z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setStep("form")}
            className="w-full h-11 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
          >
            発注手続きへ
            <span aria-hidden>→</span>
          </button>
        </>
      )}

      {step === "form" && (
        <>
          <button
            type="button"
            onClick={() => setStep("cart")}
            className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors mb-3"
          >
            <span aria-hidden>←</span> カートに戻る
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-8">発注情報</h1>

          <div className="space-y-10 mb-8">
            <FormSection label="発注元">
              <div className="border border-border rounded-xl bg-surface-muted/50 px-4 py-3">
                <p className="text-xs text-subtle">会社</p>
                <p className="text-sm font-semibold text-foreground mt-1">{customer.name}</p>
                <p className="text-xs text-subtle mt-0.5">{customer.company_id}</p>
              </div>
              <Field label="現場名" required>
                <input
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="例: ○○ビル新築工事"
                  className="input"
                />
              </Field>
              <Field label="現場担当者名" required>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="電話番号">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                />
              </Field>
            </FormSection>

            <FormSection label="受取方法">
              <div className="grid grid-cols-2 gap-2">
                <DeliveryToggle
                  active={deliveryMethod === "delivery"}
                  onClick={() => setDeliveryMethod("delivery")}
                  label="配送"
                  sub="現場まで届ける"
                />
                <DeliveryToggle
                  active={deliveryMethod === "pickup"}
                  onClick={() => setDeliveryMethod("pickup")}
                  label="引取"
                  sub="営業所で受け取る"
                />
              </div>

              {deliveryMethod === "delivery" && (
                <Field label="現場住所" required>
                  <AddressAutocomplete
                    value={deliveryAddress}
                    onChange={setDeliveryAddress}
                    onLocationChange={setDeliveryLocation}
                    placeholder="例: 大分県大分市新貝6番7号"
                  />
                  <div className="mt-3">
                    <MapPicker
                      value={deliveryLocation}
                      onChange={setDeliveryLocation}
                      onAddressReverseGeocoded={setDeliveryAddress}
                      defaultCenter={{ lat: 33.2382, lng: 131.6126 }}
                      height={240}
                    />
                  </div>
                </Field>
              )}

              {deliveryMethod === "pickup" && (
                <Field label="引取営業所" required>
                  <select
                    value={pickupOfficeId}
                    onChange={(e) => setPickupOfficeId(e.target.value)}
                    className="input"
                  >
                    <option value="">営業所を選択</option>
                    {areaOrder.map((area) => (
                      <optgroup key={area} label={area}>
                        {officesByArea[area].map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selectedOffice?.address && (
                    <div className="mt-3 border border-border rounded-xl bg-surface-muted/50 px-4 py-3 space-y-2">
                      <p className="text-sm text-foreground leading-relaxed">
                        {selectedOffice.address}
                      </p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOffice.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Google マップで開く
                      </a>
                    </div>
                  )}
                </Field>
              )}
            </FormSection>

            <FormSection label="リース期間">
              <div className="grid grid-cols-2 gap-3">
                <Field label="開始日" required>
                  <input
                    type="date"
                    value={leaseStartDate}
                    onChange={(e) => setLeaseStartDate(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="終了日" required>
                  <input
                    type="date"
                    value={leaseEndDate}
                    min={leaseStartDate || undefined}
                    onChange={(e) => setLeaseEndDate(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              <p className="text-xs text-subtle">
                {deliveryMethod === "delivery"
                  ? "開始日に現場へお届けします。"
                  : "開始日に営業所でお引き渡しします。"}
              </p>
            </FormSection>

            <FormSection label="備考">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="ご要望やご質問があればこちらへ"
                className="input min-h-[88px] py-2.5"
              />
            </FormSection>
          </div>

          {/* 注文プレビュー */}
          <div className="border border-border bg-surface rounded-xl overflow-hidden mb-6">
            <div className="px-4 py-2.5 border-b border-border bg-surface-muted/50">
              <p className="text-sm font-semibold text-foreground">
                発注内容
                <span className="text-subtle font-normal ml-2">{items.length} 品目</span>
              </p>
            </div>
            {items.map((item) => (
              <div
                key={item.cartLineId}
                className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-border last:border-b-0"
              >
                <span className="text-sm text-foreground truncate">
                  {item.material.name}
                  {item.selections.length > 0 && (
                    <span className="ml-2 text-xs text-muted">
                      ({item.selections.map((s) => s.option_label).join(" / ")})
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold text-foreground flex-shrink-0 tabular-nums">
                  × {item.quantity}
                </span>
              </div>
            ))}
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 bg-danger-soft border border-danger/20 rounded-lg text-sm text-danger">
              {errorMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("cart")}
              disabled={isPending}
              className="flex-1 h-11 inline-flex items-center justify-center gap-2 border border-border bg-surface text-foreground rounded-lg text-sm font-semibold hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span aria-hidden>←</span>
              戻る
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || isPending}
              title={!isOnline ? "オフラインのため、送信は圏内になってから自動実行されます" : undefined}
              className="flex-1 h-11 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-[background,transform] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[0.99]"
            >
              {isPending
                ? "送信中…"
                : !isOnline
                ? "オフライン送信予約する"
                : "発注する"}
              <span aria-hidden>→</span>
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          height: 2.625rem;
          padding: 0 0.875rem;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          color: var(--color-foreground);
          transition: border-color 120ms, box-shadow 120ms;
        }
        :global(.input::placeholder) {
          color: var(--color-subtle);
        }
        :global(.input:focus) {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-accent) 15%, transparent);
        }
      `}</style>
    </main>
  );
}

function FormSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-foreground pb-2 border-b border-border">
        {label}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function DeliveryToggle({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-left border-2 transition-colors ${
        active
          ? "border-accent bg-accent-soft text-foreground"
          : "border-border bg-surface text-foreground hover:bg-surface-muted"
      }`}
    >
      <span className="text-base font-bold">{label}</span>
      <span className={`text-xs ${active ? "text-accent-hover" : "text-muted"}`}>
        {sub}
      </span>
    </button>
  );
}
