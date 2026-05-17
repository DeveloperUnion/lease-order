import { getDb, type ChatOutboxItem, type ChatOutboxPayload } from "./db";

export type { ChatOutboxItem } from "./db";

export type ChatFlushResult =
  | { status: "sent"; messageId: string; duplicate: boolean }
  | { status: "failed"; error: string }
  | { status: "pending"; reason: "network" | "timeout" | "in_flight" };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueChatMessage(input: {
  tenantId: string | null;
  customerId: string | null;
  payload: ChatOutboxPayload;
}): Promise<ChatOutboxItem> {
  const now = Date.now();
  const item: ChatOutboxItem = {
    id: newId(),
    clientRequestId: input.payload.clientRequestId,
    tenantId: input.tenantId,
    customerId: input.customerId,
    payload: input.payload,
    status: "pending",
    attempts: 0,
    lastError: null,
    resultMessageId: null,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.put("chatOutbox", item);
  return item;
}

export async function listChatOutbox(
  tenantId: string | null,
  customerId: string | null
): Promise<ChatOutboxItem[]> {
  const db = await getDb();
  const all = await db.getAll("chatOutbox");
  return all
    .filter((o) => o.tenantId === tenantId && o.customerId === customerId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function chatPendingCount(
  tenantId: string | null,
  customerId: string | null
): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("chatOutbox");
  return all.filter(
    (o) =>
      o.tenantId === tenantId &&
      o.customerId === customerId &&
      (o.status === "pending" || o.status === "sending")
  ).length;
}

async function patch(
  id: string,
  patcher: (i: ChatOutboxItem) => void
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("chatOutbox", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    patcher(item);
    item.updatedAt = Date.now();
    await tx.store.put(item);
  }
  await tx.done;
}

const flightLocks = new Set<string>();

export async function flushChatOne(
  id: string,
  timeoutMs = 10_000
): Promise<ChatFlushResult> {
  if (flightLocks.has(id)) return { status: "pending", reason: "in_flight" };
  flightLocks.add(id);
  try {
    const db = await getDb();
    const item = await db.get("chatOutbox", id);
    if (!item) return { status: "pending", reason: "in_flight" };
    if (item.status === "sent" && item.resultMessageId) {
      return {
        status: "sent",
        messageId: item.resultMessageId,
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
      response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.payload),
        signal: controller.signal,
        credentials: "same-origin",
      });
    } catch (e) {
      const reason: "network" | "timeout" =
        e instanceof DOMException && e.name === "AbortError" ? "timeout" : "network";
      await patch(id, (i) => {
        i.status = "pending";
        i.attempts += 1;
        i.lastError = reason === "timeout" ? "送信タイムアウト" : "通信エラー";
      });
      return { status: "pending", reason };
    } finally {
      clearTimeout(timer);
    }

    let body:
      | { ok?: boolean; message?: { id: string }; duplicate?: boolean; error?: string }
      | null = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.ok && body?.ok && body.message?.id) {
      const messageId = body.message.id;
      const duplicate = !!body.duplicate;
      await patch(id, (i) => {
        i.status = "sent";
        i.resultMessageId = messageId;
        i.lastError = null;
      });
      return { status: "sent", messageId, duplicate };
    }
    if (response.status >= 500 || !body) {
      await patch(id, (i) => {
        i.status = "pending";
        i.attempts += 1;
        i.lastError = `サーバエラー (HTTP ${response.status})`;
      });
      return { status: "pending", reason: "network" };
    }
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

export function flushChatOutbox(): Promise<void> {
  if (flushAllInFlight) return flushAllInFlight;
  flushAllInFlight = (async () => {
    try {
      const db = await getDb();
      const all = await db.getAll("chatOutbox");
      const pending = all
        .filter((o) => o.status === "pending")
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const item of pending) {
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        const result = await flushChatOne(item.id);
        if (result.status === "pending" && result.reason === "network") break;
      }
    } finally {
      flushAllInFlight = null;
    }
  })();
  return flushAllInFlight;
}
