import Composer from "./composer";

export default function Home() {
  return (
    <main className="bg-white">
      <nav className="flex items-center gap-3 p-5">
        <img src="/icon.svg" width={32} height={32} alt="Tempel logo" />
        <div className="text-[22px] font-bold text-[#1A1A1A]">Tempel</div>
      </nav>
      <section className="flex flex-col gap-6 p-6 md:p-24">
        <p className="text-[13px] font-bold text-[#0E7A4F]">
          ZERO-KNOWLEDGE SECRET SHARING
        </p>
        <h1 className="text-4xl font-bold text-[#1A1A1A] md:text-[60px]">
          Kirim rahasia. Link hangus sekali buka.
        </h1>
        <p className="text-[17px] text-[#525252]">
          Browser enkripsi sebelum kirim. Server simpan ciphertext saja. Kunci
          ada di URL dan tidak pernah terkirim.
        </p>
        <Composer />
      </section>
      <section className="flex flex-col gap-4 bg-[#F4F4F2] p-6 md:p-24">
        <h2 className="text-3xl font-bold text-[#1A1A1A] md:text-[40px]">
          Server tidak bisa baca rahasia.
        </h2>
        <p className="text-[17px] text-[#525252]">
          AES-256-GCM di browser. Kunci di fragment URL. Link hangus atomik di
          server.
        </p>
      </section>
    </main>
  );
}
