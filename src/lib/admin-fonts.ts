import { IBM_Plex_Sans_JP, JetBrains_Mono, Noto_Serif_JP } from "next/font/google";

export const fontDisplay = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-noto-serif-jp",
  display: "swap",
  preload: false,
});

export const fontBody = IBM_Plex_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans-jp",
  display: "swap",
  preload: false,
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
});

export const adminFontVariables = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`;
