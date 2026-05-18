import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // クライアントサイドのページキャッシュ。dynamic ページの戻る/再訪を高速化。
  // default は dynamic=0 (キャッシュなし) / static=300s。dynamic を 30s に伸ばすと、
  // 30 秒以内に同じページに戻った場合は RSC payload を再 fetch せずキャッシュから即表示する。
  // ユーザー固有データの陳腐化は最大 30 秒。realtime 系は別途追従するので無害。
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // デフォルトは多くのデバイス幅を生成するが、本アプリは
    // スマホ・タブレット・PC の 3 帯域あれば十分。最適化キャッシュの
    // 多様性を抑え、Vercel image opt の cold 生成コストも削減する。
    deviceSizes: [360, 640, 1080, 1920],
    imageSizes: [56, 96, 200, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "san-sin.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
