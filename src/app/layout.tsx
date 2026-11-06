import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tempel — Kirim rahasia. Link hangus sekali buka.",
  description:
    "Browser enkripsi sebelum kirim. Server simpan ciphertext saja. Kunci ada di URL dan tidak pernah terkirim.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
