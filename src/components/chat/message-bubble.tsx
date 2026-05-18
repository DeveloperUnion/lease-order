"use client";

import Link from "next/link";
import type { SignedAttachment } from "@/lib/chat/sign-attachments";
import type { OrderRef } from "@/lib/chat/types";

export type BubbleMessage = {
  id: string;
  sender_type: "customer" | "admin";
  body: string | null;
  attachments: SignedAttachment[];
  order_ref: OrderRef | null;
  created_at: string;
  read_at: string | null;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hhmm = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hhmm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
}

export default function MessageBubble({
  msg,
  mine,
  senderLabel,
  orderLinkPrefix,
}: {
  msg: BubbleMessage;
  mine: boolean;
  senderLabel: string;
  orderLinkPrefix: "/rentals" | "/admin/orders";
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
      {/* 自分の発言は名前を省き時刻だけ。相手の発言は名前+時刻を表示 (LINE 風)。 */}
      <div className="text-[11px] text-subtle px-1">
        {!mine && <span className="mr-2">{senderLabel}</span>}
        <span>{formatTime(msg.created_at)}</span>
        {mine && msg.read_at ? <span className="ml-2 text-accent">既読</span> : null}
      </div>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap border ${
          mine
            ? "bg-accent text-accent-ink rounded-br-sm border-accent-hover/40"
            : "bg-surface text-foreground rounded-bl-sm border-border"
        }`}
      >
        {msg.order_ref ? (
          <Link
            href={`${orderLinkPrefix}/${msg.order_ref.id}`}
            className={`block mb-1.5 text-xs px-2 py-1 rounded border ${
              mine
                ? "border-accent-ink/30 text-accent-ink/90 bg-accent-ink/5"
                : "border-border text-muted bg-surface"
            }`}
          >
            注文 {msg.order_ref.order_number} について
          </Link>
        ) : null}
        {msg.body ? <div>{msg.body}</div> : null}
        {msg.attachments.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {msg.attachments.map((a) =>
              a.mime.startsWith("image/") && a.url ? (
                <a key={a.path} href={a.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.name}
                    loading="lazy"
                    decoding="async"
                    className="max-h-48 rounded border border-border"
                  />
                </a>
              ) : (
                <a
                  key={a.path}
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${
                    mine
                      ? "border-accent-ink/30 text-accent-ink"
                      : "border-border text-foreground bg-surface"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span className="truncate">{a.name}</span>
                </a>
              )
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
