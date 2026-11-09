import Composer from "./composer";

export default function Home() {
  return (
    <main className="bg-[var(--tempel-white)]">
      <nav className="flex items-center gap-3 p-5">
        <img src="/icon.svg" width={32} height={32} alt="Tempel logo" />
        <div className="text-[22px] font-bold text-[var(--tempel-ink)]">Tempel</div>
      </nav>
      <section className="flex min-w-0 flex-col gap-6 overflow-x-clip p-6 md:p-24">
        <p className="text-[13px] font-bold text-[var(--tempel-signal)]">
          ZERO-KNOWLEDGE SECRET SHARING
        </p>
        <h1 className="text-[40px] font-bold text-[var(--tempel-ink)] md:text-[60px]">
          Kirim rahasia. Link hangus sekali buka.
        </h1>
        <p className="text-[17px] text-[var(--tempel-muted)]">
          Browser enkripsi sebelum kirim. Server simpan ciphertext saja. Kunci
          ada di URL dan tidak pernah terkirim.
        </p>
        <Composer />
      </section>
      <section className="flex min-w-0 flex-col gap-4 overflow-x-clip bg-[var(--tempel-paper)] p-6 md:p-24">
        <h2 className="text-[40px] font-bold text-[var(--tempel-ink)]">
          Server tidak bisa baca rahasia.
        </h2>
        <p className="text-[17px] text-[var(--tempel-muted)]">
          AES-256-GCM di browser. Kunci di fragment URL. Link hangus atomik di
          server.
        </p>
      </section>
    </main>
  );
}
