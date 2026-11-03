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
      <body>{children}</body>
    </html>
  );
}
