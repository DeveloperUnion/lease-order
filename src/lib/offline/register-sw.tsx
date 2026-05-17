"use client";

import { useEffect } from "react";

/**
 * Service Worker (/sw.js) を boot 時に登録する。
 *
 * 開発モード (NODE_ENV !== 'production') では登録しない。
 * Next.js dev サーバの HMR と SW キャッシュが噛み合って
 * 古い HTML をつかむ事故を避けるため。動作確認は
 * `npm run build && npm start` で実行する。
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[sw] registration failed:", err);
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
