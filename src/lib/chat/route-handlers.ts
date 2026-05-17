import "server-only";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { RecipientIdentity } from "@/lib/supabase-tenant";
import {
  fetchOrderRef,
  getConversationById,
  getOrCreateConversation,
  insertMessage,
  markConversationRead,
} from "./data";
import { signAttachments } from "./sign-attachments";
import type { MessageAttachment, MessageRow, OrderRef } from "./types";

// 送信 / 既読 / アップロードのコアロジックを per-audience の route から共有する。
// 各 route は identity 解決だけ自分で行い、ここに委譲する。

type SendBody = {
  conversationId?: string;
  customerId?: string;
  body?: string | null;
  attachments?: MessageAttachment[];
  orderId?: string | null;
  clientRequestId?: string;
};

function normalizeAttachments(input: unknown): MessageAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a): a is MessageAttachment => {
      if (!a || typeof a !== "object") return false;
      const x = a as Record<string, unknown>;
      return (
        typeof x.path === "string" &&
        typeof x.name === "string" &&
        typeof x.mime === "string" &&
        typeof x.size === "number"
      );
    })
    .slice(0, 10);
}

export async function handleSendMessage(
  req: Request,
  identity: RecipientIdentity
): Promise<Response> {
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let raw: SendBody;
  try {
    raw = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  const body = typeof raw.body === "string" ? raw.body.trim() : null;
  const attachments = normalizeAttachments(raw.attachments);
  const orderId = typeof raw.orderId === "string" && raw.orderId ? raw.orderId : null;
  const clientRequestId =
    typeof raw.clientRequestId === "string" && raw.clientRequestId
      ? raw.clientRequestId
      : null;

  if (!body && attachments.length === 0) {
    return NextResponse.json(
      { ok: false, error: "本文か添付のいずれかが必要です" },
      { status: 400 }
    );
  }

  // 会話の解決
  let conversationId: string;
  if (identity.audience === "customer") {
    const conv = await getOrCreateConversation(identity.recipientId, identity.tenantId);
    conversationId = conv.id;
  } else {
    if (raw.conversationId) {
      const conv = await getConversationById(raw.conversationId, identity.tenantId);
      if (!conv) {
        return NextResponse.json({ ok: false, error: "会話が見つかりません" }, { status: 404 });
      }
      conversationId = conv.id;
    } else if (raw.customerId) {
      const conv = await getOrCreateConversation(raw.customerId, identity.tenantId);
      conversationId = conv.id;
    } else {
      return NextResponse.json(
        { ok: false, error: "conversationId または customerId が必要です" },
        { status: 400 }
      );
    }
  }

  if (orderId) {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("tenant_id", identity.tenantId)
      .maybeSingle();
    if (!order) {
      return NextResponse.json(
        { ok: false, error: "指定された注文が見つかりません" },
        { status: 400 }
      );
    }
  }

  const { message, duplicate } = await insertMessage({
    tenantId: identity.tenantId,
    conversationId,
    senderType: identity.audience,
    senderId: identity.recipientId,
    body,
    attachments,
    orderId,
    clientRequestId,
  });

  // optimistic stub をクライアントが「内容ごと」差し替えられるよう、
  // order_ref 解決済み + signed attachments まで埋めて返す。これにより client は
  // 送信完了後に router.refresh() を呼ばずに済む（layout 4 並列クエリの再実行を避ける）。
  const enriched = await enrichMessage(message, identity.tenantId);

  return NextResponse.json({
    ok: true,
    message,
    enriched,
    conversationId,
    duplicate,
  });
}

// MessageRow に order_ref と signed attachments を載せた payload。
// 送信 API の即時レスポンスと、realtime 受信後の単発 enrichment エンドポイントから返す共通形。
export async function enrichMessage(
  message: MessageRow,
  tenantId: string
): Promise<{
  id: string;
  sender_type: MessageRow["sender_type"];
  body: string | null;
  attachments: Awaited<ReturnType<typeof signAttachments>>;
  order_ref: OrderRef | null;
  created_at: string;
  read_at: string | null;
}> {
  const [attachments, order_ref] = await Promise.all([
    signAttachments(message.attachments),
    message.order_id ? fetchOrderRef(message.order_id, tenantId) : Promise.resolve(null),
  ]);
  return {
    id: message.id,
    sender_type: message.sender_type,
    body: message.body,
    attachments,
    order_ref,
    created_at: message.created_at,
    read_at: message.read_at,
  };
}

// realtime で INSERT を受け取った client が、order_id / attachments が含まれていたときに
// router.refresh() の代わりに「その 1 メッセージだけ」を enrichment するために叩く GET。
// 認可：tenant 一致は必須。customer は自分の conversation 限定。
export async function handleEnrichMessage(
  messageId: string,
  identity: RecipientIdentity
): Promise<Response> {
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("tenant_id", identity.tenantId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false }, { status: 404 });
  const message = data as MessageRow;

  if (identity.audience === "customer") {
    const conv = await getConversationById(message.conversation_id, identity.tenantId);
    if (!conv || conv.customer_id !== identity.recipientId) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  const enriched = await enrichMessage(message, identity.tenantId);
  return NextResponse.json({ ok: true, enriched });
}

export async function handleMarkRead(
  conversationId: string,
  identity: RecipientIdentity
): Promise<Response> {
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const conv = await getConversationById(conversationId, identity.tenantId);
  if (!conv) return NextResponse.json({ ok: false }, { status: 404 });
  if (
    identity.audience === "customer" &&
    conv.customer_id !== identity.recipientId
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  await markConversationRead(conversationId, identity.tenantId, identity.audience);
  return NextResponse.json({ ok: true });
}

const BUCKET = "chat-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "application/pdf"];

export async function handleUpload(
  req: Request,
  identity: RecipientIdentity
): Promise<Response> {
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid form" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file が必要です" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "ファイルサイズが上限を超えています" },
      { status: 413 }
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json(
      { ok: false, error: "対応していない形式です" },
      { status: 415 }
    );
  }

  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(0, 80) || "file";
  const path = `${identity.tenantId}/${identity.audience}-${identity.recipientId}/${randomUUID()}/${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(arrayBuffer), {
      contentType: mime,
      upsert: false,
    });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    attachment: { path, name: file.name, mime, size: file.size },
  });
}
