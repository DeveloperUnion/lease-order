"use client";

import { useEffect } from "react";
import { flushAll } from "./outbox";

/**
 * Outbox の自動 flush をブラウザイベントに連動させる。
 * 起動直後 + online 復帰 + タブが visible になった瞬間にトリガーする。
 *
 * iOS Safari は Background Sync API 未対応のため、Service Worker での
 * バックグラウンド送信は期待できない。ユーザがアプリを再度開いた瞬間に
 * ここから flush するのが現実解。
 */
export default function SyncRunner() {
  useEffect(() => {
    const trigger = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      flushAll().catch(() => {
        /* swallow — sync は best-effort */
      });
    };

    // 起動直後
    trigger();

    const onOnline = () => trigger();
    const onVisibility = () => {
      if (document.visibilityState === "visible") trigger();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
