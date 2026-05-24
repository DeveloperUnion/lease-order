"use client";

import { useState } from "react";
import Link from "next/link";
import type { Material, Office } from "@/lib/types";
import type { AdminCustomerRow } from "@/lib/admin-data";
import IntakeFlow from "@/app/(public)/cart/intake/intake-flow";
import type { IntakeEditorRow } from "@/lib/intake/build-cart-prefill";
import type { ResolvedIntake } from "@/lib/intake/types";
import { submitProxyOrder } from "./actions";

type Props = {
  tenantId: string;
  customers: AdminCustomerRow[];
  materials: Material[];
  offices: Office[];
};

export default function NewOrderFlow({ tenantId, customers, materials, offices }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [filter, setFilter] = useState("");

  const filteredCustomers =
    filter.trim() === ""
      ? customers
      : customers.filter((c) => {
          const q = filter.toLowerCase();
          return (
            c.name.toLowerCase().includes(q) ||
            (c.company_id ?? "").toLowerCase().includes(q) ||
            (c.contact_email ?? "").toLowerCase().includes(q)
          );
        });

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  async function handleAdminSubmit(args: {
    intakeDocumentId: string;
    rows: IntakeEditorRow[];
    formFields: ResolvedIntake["form_fields"];
    deliveryMethod: "delivery" | "pickup";
    pickupOfficeId: string;
  }) {
    const items = args.rows
      .filter((r) => r.material)
      .map((r) => ({
        materialId: r.material!.id,
        quantity: r.quantity,
        selections: r.selections,
      }));
    if (!items.length) return { ok: false as const, error: "明細がありません" };

    const payload = {
      siteName: args.formFields.site_name ?? "",
      contactName: args.formFields.contact_name ?? "",
      phone: args.formFields.phone ?? "",
      note: args.formFields.note ?? "",
      deliveryMethod: args.deliveryMethod,
      deliveryAddress:
        args.deliveryMethod === "delivery" ? args.formFields.delivery_address ?? "" : "",
      deliveryLat: null,
      deliveryLng: null,
      pickupOfficeId: args.deliveryMethod === "pickup" ? args.pickupOfficeId : "",
      leaseStartDate: args.formFields.rental_start_date ?? "",
      leaseEndDate: args.formFields.rental_end_date ?? "",
      items,
    };

    return submitProxyOrder({
      customerId,
      intakeDocumentId: args.intakeDocumentId,
      payload,
    });
  }

  if (!selectedCustomer) {
    return (
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-7">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-accent transition-colors"
        >
          <span aria-hidden>←</span> 発注一覧に戻る
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2 mb-1">
          代行発注（発注書取り込み）
        </h1>
        <p className="text-sm text-muted mb-6">
          顧客を選択し、紙/FAX/メールで届いた発注書を画像 or PDF でアップロードします。
        </p>

        <section className="border border-border bg-surface rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            1. 発注元顧客を選択
          </h2>
          <input
            type="search"
            placeholder="会社名・コード・メールで検索"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full h-10 px-3 text-sm rounded-lg border border-border bg-surface text-foreground focus:border-accent focus:outline-none mb-3"
          />
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border border border-border rounded-xl">
            {filteredCustomers.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setCustomerId(c.id)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors"
                >
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="text-xs text-subtle mt-0.5">
                    {c.company_id}
                    {c.contact_email ? ` · ${c.contact_email}` : ""}
                  </p>
                </button>
              </li>
            ))}
            {filteredCustomers.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-subtle">
                該当する顧客がいません
              </li>
            )}
          </ul>
        </section>
      </main>
    );
  }

  return (
    <div>
      <div className="max-w-3xl mx-auto w-full px-4 pt-5">
        <div className="flex items-center justify-between border border-border bg-accent-soft rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-subtle">代行発注の対象顧客</p>
            <p className="text-sm font-semibold text-foreground">
              {selectedCustomer.name}
              <span className="text-subtle font-normal ml-2">
                ({selectedCustomer.company_id})
              </span>
            </p>
          </div>
          <button
            onClick={() => setCustomerId("")}
            className="text-xs text-accent hover:underline"
          >
            別の顧客を選ぶ
          </button>
        </div>
      </div>
      <IntakeFlow
        mode="admin"
        tenantId={tenantId}
        customerId={selectedCustomer.id}
        materials={materials}
        offices={offices}
        onSubmit={handleAdminSubmit}
      />
    </div>
  );
}
