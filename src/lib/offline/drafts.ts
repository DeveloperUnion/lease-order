import { getDb, EMPTY_FORM_FIELDS, type Draft, type DraftFormFields } from "./db";
import type { CartItem } from "../types";

export type { Draft, DraftFormFields } from "./db";

const ACTIVE_DRAFT_KEY_PREFIX = "lo_active_draft:";

function activeKey(tenantId: string | null, customerId: string | null): string {
  return `${ACTIVE_DRAFT_KEY_PREFIX}${tenantId ?? "_"}:${customerId ?? "_"}`;
}

export function getActiveDraftIdSync(
  tenantId: string | null,
  customerId: string | null
): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(activeKey(tenantId, customerId));
  } catch {
    return null;
  }
}

export function setActiveDraftIdSync(
  tenantId: string | null,
  customerId: string | null,
  draftId: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const key = activeKey(tenantId, customerId);
    if (draftId) window.localStorage.setItem(key, draftId);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createDraft(input: {
  tenantId: string | null;
  customerId: string | null;
  name?: string;
}): Promise<Draft> {
  const now = Date.now();
  const draft: Draft = {
    id: newId(),
    tenantId: input.tenantId,
    customerId: input.customerId,
    name: input.name?.trim() || "新規下書き",
    items: [],
    formFields: { ...EMPTY_FORM_FIELDS },
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put("drafts", draft);
  return draft;
}

export async function getDraft(id: string): Promise<Draft | null> {
  const db = await getDb();
  return (await db.get("drafts", id)) ?? null;
}

export async function listDrafts(
  tenantId: string | null,
  customerId: string | null
): Promise<Draft[]> {
  const db = await getDb();
  const all = await db.getAll("drafts");
  return all
    .filter((d) => d.tenantId === tenantId && d.customerId === customerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("drafts", id);
}

export async function updateDraftItems(
  id: string,
  items: CartItem[]
): Promise<Draft | null> {
  return mutateDraft(id, (d) => {
    d.items = items;
    d.name = deriveNameFromDraft(d);
  });
}

export async function updateDraftFormFields(
  id: string,
  fields: Partial<DraftFormFields>
): Promise<Draft | null> {
  return mutateDraft(id, (d) => {
    d.formFields = { ...d.formFields, ...fields };
    d.name = deriveNameFromDraft(d);
  });
}

export async function renameDraft(
  id: string,
  name: string
): Promise<Draft | null> {
  return mutateDraft(id, (d) => {
    d.name = name.trim() || "新規下書き";
  });
}

async function mutateDraft(
  id: string,
  fn: (d: Draft) => void
): Promise<Draft | null> {
  const db = await getDb();
  const tx = db.transaction("drafts", "readwrite");
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return null;
  }
  fn(current);
  current.updatedAt = Date.now();
  await tx.store.put(current);
  await tx.done;
  return current;
}

function deriveNameFromDraft(d: Draft): string {
  const site = d.formFields.siteName.trim();
  if (site) return site;
  if (d.items.length > 0) {
    const first = d.items[0].material.name;
    return d.items.length > 1
      ? `${first} 他 ${d.items.length - 1} 品目`
      : first;
  }
  return "新規下書き";
}

export async function ensureActiveDraft(
  tenantId: string | null,
  customerId: string | null
): Promise<Draft> {
  const existingId = getActiveDraftIdSync(tenantId, customerId);
  if (existingId) {
    const found = await getDraft(existingId);
    if (found && found.tenantId === tenantId && found.customerId === customerId) {
      return found;
    }
  }
  const created = await createDraft({ tenantId, customerId });
  setActiveDraftIdSync(tenantId, customerId, created.id);
  return created;
}
