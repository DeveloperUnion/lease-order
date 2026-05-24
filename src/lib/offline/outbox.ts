import { getDb, type OutboxItem } from "./db";
import type { SubmitOrderInput } from "../order-submission";

export type { OutboxItem, OutboxStatus } from "./db";

export type FlushResult =
  | { status: "sent"; orderNumber: string; duplicate: boolean }
  | { status: "failed"; error: string }
  | { status: "pending"; reason: "network" | "timeout" | "in_flight" };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // 簡易フォールバック: crypto.randomUUID 未対応環境用（古い iOS など）。
  // server 側の UUID 形式バリデーションを通すため uuid v4 風に整形。
  const hex = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${["8", "9", "a", "b"][Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

export async function enqueue(input: {
  tenantId: string | null;
  customerId: string | null;
  payload: SubmitOrderInput;
  intakeDocumentId?: string | null;
}): Promise<OutboxItem> {
  const now = Date.now();
  const item: OutboxItem = {
    id: newId(),
    clientRequestId: newRequestId(),
    tenantId: input.tenantId,
    customerId: input.customerId,
    payload: input.payload,
    intakeDocumentId: input.intakeDocumentId ?? null,
    status: "pending",
    attempts: 0,
    lastError: null,
    resultOrderNumber: null,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put("outbox", item);
  return item;
}

export async function listOutbox(
  tenantId: string | null,
  customerId: string | null
): Promise<OutboxItem[]> {
  const db = await getDb();
  const all = await db.getAll("outbox");
  return all
    .filter((o) => o.tenantId === tenantId && o.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function pendingCount(
  tenantId: string | null,
  customerId: string | null
): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("outbox");
  return all.filter(
    (o) =>
      o.tenantId === tenantId &&
      o.customerId === customerId &&
      (o.status === "pending" || o.status === "sending")
  ).length;
}

export async function removeItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("outbox", id);
}

export async function retryItem(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    item.status = "pending";
    item.lastError = null;
    item.updatedAt = Date.now();
    await tx.store.put(item);
  }
  await tx.done;
}

async function patch(id: string, patcher: (i: OutboxItem) => void): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("outbox", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    patcher(item);
    item.updatedAt = Date.now();
    await tx.store.put(item);
  }
  await tx.done;
}

const flightLocks = new Set<string>();

export async function flushOne(
  id: string,
  timeoutMs = 10_000
): Promise<FlushResult> {
  if (flightLocks.has(id)) {
    return { status: "pending", reason: "in_flight" };
  }
  flightLocks.add(id);
  try {
    const db = await getDb();
    const item = await db.get("outbox", id);
    if (!item) return { status: "pending", reason: "in_flight" };
    if (item.status === "sent" && item.resultOrderNumber) {
      return {
        status: "sent",
        orderNumber: item.resultOrderNumber,
        duplicate: true,
      };
    }
    if (item.status === "failed") {
      return { status: "failed", error: item.lastError ?? "送信に失敗しました" };
    }

    await patch(id, (i) => {
      i.status = "sending";
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_request_id: item.clientRequestId,
          payload: item.payload,
          intake_document_id: item.intakeDocumentId ?? null,
        }),
        signal: controller.signal,
        credentials: "same-origin",
      });
    } catch (e) {
      const reason: "network" | "timeout" =
        e instanceof DOMException && e.name === "AbortError"
          ? "timeout"
          : "network";
      await patch(id, (i) => {
        i.status = "pending";
        i.attempts += 1;
        i.lastError = reason === "timeout" ? "送信タイムアウト" : "通信エラー";
      });
      return { status: "pending", reason };
    } finally {
      clearTimeout(timer);
    }

    let body: { ok?: boolean; orderNumber?: string; duplicate?: boolean; error?: string } | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok && body?.ok && body.orderNumber) {
      const orderNumber = body.orderNumber;
      const duplicate = !!body.duplicate;
      await patch(id, (i) => {
        i.status = "sent";
        i.resultOrderNumber = orderNumber;
        i.lastError = null;
      });
      return { status: "sent", orderNumber, duplicate };
    }

    // 5xx もしくは body 不在 → 一時障害として pending を維持
    if (response.status >= 500 || !body) {
      await patch(id, (i) => {
        i.status = "pending";
        i.attempts += 1;
        i.lastError = `サーバエラー (HTTP ${response.status})`;
      });
      return { status: "pending", reason: "network" };
    }

    // 4xx + body.ok=false → 入力不備など、自動リトライ不可
    const errorMsg = body.error ?? `HTTP ${response.status}`;
    await patch(id, (i) => {
      i.status = "failed";
      i.attempts += 1;
      i.lastError = errorMsg;
    });
    return { status: "failed", error: errorMsg };
  } finally {
    flightLocks.delete(id);
  }
}

let flushAllInFlight: Promise<void> | null = null;

export function flushAll(): Promise<void> {
  if (flushAllInFlight) return flushAllInFlight;
  flushAllInFlight = (async () => {
    try {
      const db = await getDb();
      const all = await db.getAll("outbox");
      const pending = all
        .filter((o) => o.status === "pending")
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const item of pending) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        const result = await flushOne(item.id);
        // 連続して network 失敗するなら以降の試行は無駄。即抜ける。
        if (result.status === "pending" && result.reason === "network") break;
      }
    } finally {
      flushAllInFlight = null;
    }
  })();
  return flushAllInFlight;
}
