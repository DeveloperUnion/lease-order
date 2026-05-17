"use client";

import {
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { MessageAttachment } from "@/lib/chat/types";

type QuotedOrder = { id: string; order_number: string } | null;

export default function ChatComposer({
  onSend,
  quoted,
  onClearQuoted,
  disabled,
  uploadUrl,
}: {
  onSend: (input: {
    body: string;
    attachments: MessageAttachment[];
    orderId: string | null;
  }) => Promise<void>;
  quoted: QuotedOrder;
  onClearQuoted: () => void;
  disabled?: boolean;
  uploadUrl: string;
}) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = !disabled && !uploading && !isPending && (body.trim() !== "" || attachments.length > 0);

  function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    const payload = {
      body: body.trim(),
      attachments,
      orderId: quoted?.id ?? null,
    };
    startTransition(async () => {
      try {
        await onSend(payload);
        setBody("");
        setAttachments([]);
        onClearQuoted();
      } catch (e) {
        setError(e instanceof Error ? e.message : "送信に失敗しました");
      }
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter で送信、Shift+Enter または IME 変換中は改行のまま。
    // e.nativeEvent.isComposing で IME 変換中の Enter は無視する（日本語入力でよくある誤送信の防止）。
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "アップロードに失敗しました");
      } else {
        setAttachments((prev) => [...prev, json.attachment as MessageAttachment]);
      }
    } catch {
      setError("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-surface">
      {quoted && (
        <div className="px-3 pt-2 flex items-center gap-2">
          <span className="text-xs text-muted bg-accent-soft text-accent px-2 py-1 rounded">
            注文 {quoted.order_number} について
          </span>
          <button
            type="button"
            onClick={onClearQuoted}
            className="text-xs text-subtle hover:text-foreground"
            aria-label="引用解除"
          >
            ×
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span
              key={a.path}
              className="inline-flex items-center gap-1 text-xs bg-surface-muted px-2 py-1 rounded border border-border max-w-[12rem]"
            >
              <span className="truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                aria-label="添付削除"
                className="text-subtle hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {error && (
        <div className="px-3 pt-2 text-xs text-danger">{error}</div>
      )}
      <div className="flex items-end gap-2 p-2">
        <label className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-border hover:bg-surface-muted cursor-pointer flex-shrink-0">
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            disabled={uploading || disabled}
          />
          <svg className="h-5 w-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力（Enter で送信・Shift+Enter で改行）"
          rows={1}
          className="flex-1 min-h-[40px] max-h-32 px-3 py-2 bg-surface border border-border rounded-lg text-sm resize-y focus:outline-none focus:border-accent"
          disabled={disabled}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-10 px-4 rounded-lg bg-accent text-accent-ink text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity flex-shrink-0"
        >
          送信
        </button>
      </div>
    </form>
  );
}
