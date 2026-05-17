"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteReturnPhoto,
  listReturnPhotos,
  uploadReturnPhoto,
  type ReturnPhoto,
} from "./photo-actions";

const MAX_PHOTOS = 6;
const RESIZE_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export type AiPrefill = {
  receivedQuantity: number;
  cancelledQuantity: number;
  lostQuantity: number;
  damagedQuantity: number;
  damageNotes: string | null;
  overallNotes: string | null;
};

type AiItem = {
  material_name: string;
  detected_quantity: number;
  damaged_quantity: number;
  confidence: number;
  notes?: string;
};

type AiResponse = {
  ok: true;
  expected: { material_name: string; requested_quantity_delta: number }[];
  result: { items: AiItem[]; overall_notes?: string };
  prefill: AiPrefill;
  matched: AiItem | null;
};

export default function InspectionPhotos({
  requestId,
  requestedDelta,
  targetMaterialName,
  onPrefill,
}: {
  requestId: string;
  requestedDelta: number;
  targetMaterialName: string;
  onPrefill: (p: AiPrefill) => void;
}) {
  const [photos, setPhotos] = useState<ReturnPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiResponse | null>(null);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listReturnPhotos(requestId)
      .then((rows) => {
        if (!cancelled) setPhotos(rows);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of files) {
        if (photos.length >= MAX_PHOTOS) {
          setUploadError(`写真は ${MAX_PHOTOS} 枚までです`);
          break;
        }
        const resized = await resizeImage(file);
        const fd = new FormData();
        fd.append("photo", resized, resized.name);
        const created = await uploadReturnPhoto(requestId, fd);
        setPhotos((prev) => [...prev, created]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function onDelete(photoId: string) {
    setUploadError(null);
    startTransition(async () => {
      try {
        await deleteReturnPhoto(photoId);
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "削除に失敗しました");
      }
    });
  }

  async function onRunAi() {
    if (photos.length === 0) {
      setAiError("写真を 1 枚以上アップロードしてください");
      return;
    }
    setAiError(null);
    setAiRunning(true);
    try {
      const res = await fetch("/api/admin/inspect-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnRequestId: requestId }),
      });
      const json = (await res.json()) as AiResponse | { error: string };
      if (!res.ok || !("ok" in json)) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        setAiError(msg);
        return;
      }
      setAiResult(json);
      onPrefill(json.prefill);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI 読み取りに失敗しました");
    } finally {
      setAiRunning(false);
    }
  }

  return (
    <div className="space-y-3 border border-rule rounded p-3 bg-surface-muted">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold text-foreground">写真検品（任意）</h4>
        <span className="text-[11px] text-subtle tabular-nums">
          {photos.length} / {MAX_PHOTOS} 枚
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative w-20 h-20 rounded overflow-hidden border border-rule bg-surface">
            {/* signed URL は外部ドメイン。next/image を避けて素の img で十分 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.signedUrl} alt="返却写真" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              aria-label="削除"
              className="absolute top-0.5 right-0.5 h-5 w-5 inline-flex items-center justify-center rounded-full bg-foreground/70 text-white text-[10px] hover:bg-foreground"
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 rounded border border-dashed border-rule bg-surface text-xs text-muted hover:text-foreground hover:border-accent disabled:opacity-50 flex flex-col items-center justify-center gap-1"
          >
            <span aria-hidden className="text-base leading-none">＋</span>
            <span>{uploading ? "アップロード中" : "撮影/選択"}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onPickFiles}
        />
      </div>

      {uploadError && (
        <p role="alert" className="text-[11px] text-danger">
          {uploadError}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-rule pt-3">
        <button
          type="button"
          onClick={onRunAi}
          disabled={aiRunning || photos.length === 0}
          className="px-3 h-8 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {aiRunning ? "AI で読み取り中…" : "AI で読み取る"}
        </button>
        <span className="text-[11px] text-subtle">
          対象: <span className="text-foreground">{targetMaterialName}</span> ×{requestedDelta}
        </span>
      </div>

      {aiError && (
        <p role="alert" className="text-[11px] text-danger">
          {aiError}
        </p>
      )}

      {aiResult && (
        <div className="space-y-2 border-t border-rule pt-3">
          <p className="text-[11px] font-semibold text-foreground">AI 読み取り結果</p>
          <ul className="space-y-1">
            {aiResult.result.items.map((it, i) => {
              const exp = aiResult.expected.find((e) => e.material_name === it.material_name);
              const isTarget = it.material_name === targetMaterialName;
              const match =
                exp && it.detected_quantity === exp.requested_quantity_delta
                  ? "match"
                  : exp && it.detected_quantity < exp.requested_quantity_delta
                    ? "under"
                    : exp && it.detected_quantity > exp.requested_quantity_delta
                      ? "over"
                      : "unknown";
              const confLabel =
                it.confidence >= 0.9 ? "高" : it.confidence >= 0.7 ? "中" : "低";
              return (
                <li
                  key={i}
                  className={`text-[11px] flex items-baseline gap-2 ${
                    isTarget ? "text-foreground font-medium" : "text-muted"
                  }`}
                >
                  <Badge variant={match} />
                  <span className="truncate">{it.material_name}</span>
                  <span className="tabular-nums">×{it.detected_quantity}</span>
                  {it.damaged_quantity > 0 && (
                    <span className="text-warning tabular-nums">（損傷 {it.damaged_quantity}）</span>
                  )}
                  <span className="ml-auto text-subtle">確信度 {confLabel}</span>
                </li>
              );
            })}
          </ul>
          {aiResult.result.overall_notes && (
            <p className="text-[11px] text-subtle">所見: {aiResult.result.overall_notes}</p>
          )}
          <p className="text-[11px] text-success">↓ 下の数量フィールドにプリフィルしました。必要なら手動で調整してください。</p>
        </div>
      )}
    </div>
  );
}

function Badge({ variant }: { variant: "match" | "under" | "over" | "unknown" }) {
  const map: Record<typeof variant, { label: string; className: string }> = {
    match: { label: "一致", className: "bg-success-soft text-success" },
    under: { label: "不足", className: "bg-warning-soft text-warning" },
    over: { label: "余剰", className: "bg-info-soft text-info" },
    unknown: { label: "対象外", className: "bg-surface-muted text-subtle" },
  };
  const v = map[variant];
  return (
    <span className={`inline-flex items-center px-1.5 h-[16px] rounded-sm text-[10px] font-semibold ${v.className}`}>
      {v.label}
    </span>
  );
}

// 長辺 1600px に縮小して JPEG で再エンコード。元ファイルが既に小さければそのまま返す。
async function resizeImage(file: File): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  try {
    const { width, height } = bitmap;
    const long = Math.max(width, height);
    if (long <= RESIZE_LONG_EDGE && file.size < 1.5 * 1024 * 1024) return file;
    const scale = long > RESIZE_LONG_EDGE ? RESIZE_LONG_EDGE / long : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
