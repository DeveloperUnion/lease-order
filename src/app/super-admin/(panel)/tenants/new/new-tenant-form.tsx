"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTenantAction } from "../../actions";
import type { BillingRule } from "@/lib/pricing";
import {
  SectionRule,
  FormField,
  TextInput,
  Select,
  Button,
} from "@/components/admin/ui";

const PRODUCT_DOMAIN = "lease-order.kensetsu-tech.com";

export default function NewTenantForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [billingType, setBillingType] = useState<"monthly" | "daily">("monthly");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    void formData;
    setError(null);
    startTransition(async () => {
      const billingRule: BillingRule = { type: billingType };
      const result = await createTenantAction({ name, slug, billingRule });
      if (result.ok) {
        router.push(`/tenants/${result.id}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-6 max-w-lg">
      <FormField label="テナント名（会社名）" htmlFor="name" required>
        <TextInput
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="三信産業株式会社"
        />
      </FormField>

      <FormField
        label="slug（サブドメイン）"
        htmlFor="slug"
        required
        hint={
          slug
            ? `${slug}.${PRODUCT_DOMAIN}`
            : "英小文字・数字・ハイフン。例: sanshin"
        }
      >
        <TextInput
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="sanshin"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="font-[family-name:var(--font-mono)]"
        />
      </FormField>

      <FormField label="課金ルール" htmlFor="billing">
        <Select
          id="billing"
          name="billing"
          value={billingType}
          onChange={(e) => setBillingType(e.target.value as "monthly" | "daily")}
        >
          <option value="monthly">月額</option>
          <option value="daily">日額</option>
        </Select>
      </FormField>

      {error && (
        <p className="text-sm text-[var(--color-status-rejected-fg)]">{error}</p>
      )}

      <SectionRule className="!my-2" />

      <div className="flex items-center gap-2">
        <Button type="submit" size="md" disabled={isPending || !name.trim() || !slug.trim()}>
          {isPending ? "作成中…" : "テナントを作成"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => router.push("/")}
          disabled={isPending}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
