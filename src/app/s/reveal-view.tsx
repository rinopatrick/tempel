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
      <section aria-label="Hasil" className="flex w-full flex-col gap-6">
        <p className="text-[13px] font-bold text-[#0E7A4F]">LINK HANGUS</p>
        <h1 className="text-4xl font-bold text-[#1A1A1A] md:text-[56px]">
          Rahasia terbuka. Link sudah hangus.
        </h1>
        <div className="flex w-full flex-col gap-4 bg-[#F4F4F2] p-8">
          <p className="break-all font-mono text-base text-[#1A1A1A]">
            {state.secret}
          </p>
          <p className="text-sm text-[#525252]">
            Didekripsi lokal. Salin sekarang.
          </p>
        </div>
      </section>
    );
  }

  if (state.status === "burned") {
    return (
      <section aria-label="Hangus" className="flex w-full flex-col gap-6">
        <p className="text-[13px] font-bold text-[#B25E00]">LINK HANGUS</p>
        <h1 className="text-4xl font-bold text-[#1A1A1A] md:text-[56px]">
          Link sudah hangus.
        </h1>
        <p className="text-[17px] text-[#525252]">
          Link ini pernah dibuka. Rahasia dihapus saat itu juga.
        </p>
      </section>
    );
  }

  if (state.status === "expired") {
    return (
      <section aria-label="Kedaluwarsa" className="flex w-full flex-col gap-6">
        <p className="text-[13px] font-bold text-[#B25E00]">LINK KEDALUWARSA</p>
        <h1 className="text-4xl font-bold text-[#1A1A1A] md:text-[56px]">
          Link kedaluwarsa.
        </h1>
        <p className="text-[17px] text-[#525252]">
          Link ini lewat batas waktu. Minta pengirim buat link baru.
        </p>
      </section>
    );
  }

  if (state.status === "failed") {
    return (
      <section aria-label="Gagal" className="flex w-full flex-col gap-6">
        <p className="text-[13px] font-bold text-[#B25E00]">LINK SEKALI BUKA</p>
        <h1 className="text-4xl font-bold text-[#1A1A1A] md:text-[56px]">
          Link tidak bisa dibuka.
        </h1>
        <p role="alert" className="text-[17px] text-[#525252]">
          {state.message}
        </p>
        {state.retry === true ? (
          <button
            type="button"
            onClick={onReveal}
            className="w-fit bg-[#1A1A1A] px-[18px] py-[18px] text-[15px] font-bold text-white"
          >
            Coba lagi
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Reveal" className="flex w-full flex-col gap-6">
      <p className="text-[13px] font-bold text-[#B25E00]">LINK SEKALI BUKA</p>
      <h1 className="text-4xl font-bold text-[#1A1A1A] md:text-[56px]">
        Seseorang mengirim rahasia untukmu.
      </h1>
      <p className="text-[17px] text-[#525252]">
        Klik tombol untuk tampilkan. Server hapus link saat itu juga.
      </p>
      <button
        type="button"
        onClick={onReveal}
        disabled={state.status === "loading"}
        className="w-fit bg-[#1A1A1A] px-[18px] py-[18px] text-[15px] font-bold text-white disabled:opacity-50"
      >
        {state.status === "loading" ? "Membuka…" : "Tampilkan dan hapus link"}
      </button>
    </section>
  );
}
