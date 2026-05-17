import { NextResponse } from "next/server";
import { resolveRecipientIdentity } from "@/lib/supabase-tenant";
import {
  getConversationById,
  getOrCreateConversation,
  insertMessage,
} from "@/lib/chat/data";
import type { MessageAttachment } from "@/lib/chat/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Body = {
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

export async function POST(req: Request): Promise<Response> {
  const identity = await resolveRecipientIdentity();
  if (identity.audience === "anonymous") {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let raw: Body;
  try {
    raw = (await req.json()) as Body;
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

  // 会話の解決:
  //   - customer: 自分の唯一の会話を get-or-create
  //   - admin: conversationId か customerId が必要
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

  // 注文引用の検証（指定された orderId が同テナントの実在注文かを確認）
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

  return NextResponse.json({
    ok: true,
    message,
    conversationId,
    duplicate,
  });
}
