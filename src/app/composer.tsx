"use client";

import { useState } from "react";
import { createShareLink, TTL_OPTIONS } from "@/secret/composer";

export default function Composer() {
  const [secret, setSecret] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState<number>(TTL_OPTIONS[0].seconds);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const shareLink = await createShareLink({
        origin: window.location.origin,
        secret,
        ttlSeconds,
      });
      setLink(shareLink);
    } catch (err) {
      setLink(null);
      setError(err instanceof Error ? err.message : "Gagal membuat link.");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Penyalinan gagal. Salin link secara manual.");
    }
  }

  return (
    <section aria-label="Composer" className="w-full bg-[var(--tempel-paper)] p-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label htmlFor="tempel-secret" className="sr-only">
          Secret
        </label>
        <textarea
          id="tempel-secret"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="Tempel password atau API key di sini"
          rows={4}
          className="w-full bg-transparent font-mono text-sm text-[var(--tempel-ink)] placeholder:text-[var(--tempel-muted)] focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="tempel-ttl" className="sr-only">
            Kedaluwarsa
          </label>
          <select
            id="tempel-ttl"
            value={ttlSeconds}
            onChange={(event) => setTtlSeconds(Number(event.target.value))}
            className="bg-[var(--tempel-white)] px-3 py-2 font-mono text-[13px] text-[var(--tempel-ink)]"
          >
            {TTL_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy || secret.trim().length === 0}
            className="bg-[var(--tempel-ink)] px-4 py-3 text-[15px] font-bold text-[var(--tempel-white)] disabled:opacity-50"
          >
            {busy ? "Membuat…" : "Buat link rahasia"}
          </button>
        </div>
        <p className="font-mono text-[13px] text-[var(--tempel-muted)]">
          burn-after-read | kedaluwarsa {TTL_OPTIONS.find((o) => o.seconds === ttlSeconds)?.label} |
          buka 1x
        </p>
      </form>
      {error !== null && (
        <p role="alert" className="mt-4 text-[15px] text-[var(--tempel-warn)]">
          Gagal membuat link: {error}
        </p>
      )}
      {link !== null && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="break-all font-mono text-sm text-[var(--tempel-ink)]">{link}</p>
          <button
            type="button"
            onClick={onCopy}
            className="w-fit bg-[var(--tempel-ink)] px-4 py-2 text-sm font-bold text-[var(--tempel-white)]"
          >
            {copied ? "Tersalin" : "Salin link"}
          </button>
        </div>
      )}
    </section>
  );
}
