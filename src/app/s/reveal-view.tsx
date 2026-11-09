"use client";

import { useRef, useState } from "react";
import {
  RevealBurnedError,
  RevealExpiredError,
  revealSecret,
  RevealNetworkError,
} from "@/secret/reveal";

export type RevealState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; secret: string }
  | { status: "burned" }
  | { status: "expired" }
  | { status: "failed"; message: string; retry?: boolean };

function fragmentKey(): string {
  return window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
}

export function RevealView({ id }: { id: string }) {
  const attemptedRef = useRef(false);
  const [state, setState] = useState<RevealState>(() => {
    if (typeof window !== "undefined" && fragmentKey().length === 0) {
      return { status: "failed", message: "Link tidak valid." };
    }
    return { status: "idle" };
  });

  async function onReveal() {
    if (state.status === "loading" || state.status === "done") return;
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    setState({ status: "loading" });
    try {
      const secret = await revealSecret({ id, key: fragmentKey() });
      setState({ status: "done", secret });
    } catch (err) {
      if (err instanceof RevealNetworkError) {
        attemptedRef.current = false;
      }
      if (err instanceof RevealBurnedError) {
        setState({ status: "burned" });
        return;
      }
      if (err instanceof RevealExpiredError) {
        setState({ status: "expired" });
        return;
      }
      setState({
        status: "failed",
        message: err instanceof Error ? err.message : "Gagal membuka link.",
        retry: err instanceof RevealNetworkError,
      });
    }
  }

  if (state.status === "done") {
    return (
      <section aria-label="Hasil" className="flex w-full min-w-0 flex-col gap-6 overflow-x-clip">
        <p className="text-[13px] font-bold text-[var(--tempel-signal)]">LINK HANGUS</p>
        <h1 className="text-[40px] font-bold text-[var(--tempel-ink)] md:text-[56px]">
          Rahasia terbuka. Link sudah hangus.
        </h1>
        <div className="flex w-full flex-col gap-4 bg-[var(--tempel-paper)] p-8">
          <p className="break-all font-mono text-base text-[var(--tempel-ink)]">
            {state.secret}
          </p>
          <p className="text-sm text-[var(--tempel-muted)]">
            Didekripsi lokal. Salin sekarang.
          </p>
        </div>
      </section>
    );
  }

  if (state.status === "burned") {
    return (
      <section aria-label="Hangus" className="flex w-full min-w-0 flex-col gap-6 overflow-x-clip">
        <p className="text-[13px] font-bold text-[var(--tempel-warn)]">LINK HANGUS</p>
        <h1 className="text-[40px] font-bold text-[var(--tempel-ink)] md:text-[56px]">
          Link sudah hangus.
        </h1>
        <p className="text-[17px] text-[var(--tempel-muted)]">
          Link ini pernah dibuka. Rahasia dihapus saat itu juga.
        </p>
      </section>
    );
  }

  if (state.status === "expired") {
    return (
      <section aria-label="Kedaluwarsa" className="flex w-full min-w-0 flex-col gap-6 overflow-x-clip">
        <p className="text-[13px] font-bold text-[var(--tempel-warn)]">LINK KEDALUWARSA</p>
        <h1 className="text-[40px] font-bold text-[var(--tempel-ink)] md:text-[56px]">
          Link kedaluwarsa.
        </h1>
        <p className="text-[17px] text-[var(--tempel-muted)]">
          Link ini lewat batas waktu. Minta pengirim buat link baru.
        </p>
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section aria-label="Gagal" className="flex w-full min-w-0 flex-col gap-6 overflow-x-clip">
        <p className="text-[13px] font-bold text-[var(--tempel-warn)]">LINK SEKALI BUKA</p>
        <h1 className="text-[40px] font-bold text-[var(--tempel-ink)] md:text-[56px]">
          Link tidak bisa dibuka.
        </h1>
        <p role="alert" className="text-[17px] text-[var(--tempel-muted)]">
          {state.message}
        </p>
        {state.retry === true ? (
          <button
            type="button"
            onClick={onReveal}
            className="w-fit bg-[var(--tempel-ink)] px-4 py-4 text-[15px] font-bold text-[var(--tempel-white)]"
          >
            Coba lagi
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Reveal" className="flex w-full min-w-0 flex-col gap-6 overflow-x-clip">
      <p className="text-[13px] font-bold text-[var(--tempel-warn)]">LINK SEKALI BUKA</p>
      <h1 className="text-[40px] font-bold text-[var(--tempel-ink)] md:text-[56px]">
        Seseorang mengirim rahasia untukmu.
      </h1>
      <p className="text-[17px] text-[var(--tempel-muted)]">
        Klik tombol untuk tampilkan. Server hapus link saat itu juga.
      </p>
      <button
        type="button"
        onClick={onReveal}
        disabled={state.status === "loading"}
        className="w-fit bg-[var(--tempel-ink)] px-4 py-4 text-[15px] font-bold text-[var(--tempel-white)] disabled:opacity-50"
      >
        {state.status === "loading" ? "Membuka…" : "Tampilkan dan hapus link"}
      </button>
    </section>
  );
}
