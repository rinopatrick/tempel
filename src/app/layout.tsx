import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted at build (#70) so the CSP keeps font-src 'self'. The variables
// override the :root token stacks from <body> down, keeping their fallbacks.
const sans = Inter({
  subsets: ["latin"],
  variable: "--tempel-sans",
  fallback: ["system-ui", "sans-serif"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--tempel-mono",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Tempel — Kirim rahasia. Link hangus sekali buka.",
  description:
    "Browser enkripsi sebelum kirim. Server simpan ciphertext saja. Kunci ada di URL dan tidak pernah terkirim.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
