import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_JP, IBM_Plex_Mono } from "next/font/google";
import { getTenantSlug } from "@/lib/tenant";
import RegisterSW from "@/lib/offline/register-sw";
import "./globals.css";

const plexJp = IBM_Plex_Sans_JP({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-jp",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "union発注for リース",
  description: "仮設足場機材の発注管理システム",
  appleWebApp: {
    capable: true,
    title: "union発注",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#06b6d4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenant = await getTenantSlug();
  return (
    <html
      lang="ja"
      data-tenant={tenant}
      className={`h-full antialiased ${plexJp.variable} ${plexMono.variable}`}
    >
      <body className="min-h-full flex flex-col bg-surface-muted">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
