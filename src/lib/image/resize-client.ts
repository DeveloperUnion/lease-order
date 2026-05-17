// クライアント側で画像を縮小し JPEG で再エンコードする。
// アップロード経路（材料・カテゴリ・チャット・返却検品）で共通利用する。
//
// - 非画像（PDF 等）は素通し（チャットは PDF も受け付けるため）
// - createImageBitmap 失敗時（SVG・壊れた画像）も元ファイルを返す
// - 既に十分小さければ再エンコードしない

export type ResizeOptions = {
  maxEdge?: number;
  quality?: number;
  minSizeBytes?: number;
};

const DEFAULTS = {
  maxEdge: 1600,
  quality: 0.8,
  minSizeBytes: 1.5 * 1024 * 1024,
};

export async function resizeImage(
  file: File,
  opts: ResizeOptions = {}
): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  const maxEdge = opts.maxEdge ?? DEFAULTS.maxEdge;
  const quality = opts.quality ?? DEFAULTS.quality;
  const minSizeBytes = opts.minSizeBytes ?? DEFAULTS.minSizeBytes;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  try {
    const { width, height } = bitmap;
    const long = Math.max(width, height);
    if (long <= maxEdge && file.size < minSizeBytes) return file;
    const scale = long > maxEdge ? maxEdge / long : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}
