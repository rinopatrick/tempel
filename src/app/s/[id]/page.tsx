import { RevealView } from "../reveal-view";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="bg-[var(--tempel-white)]">
      <nav className="flex items-center gap-3 p-5">
        <img src="/icon.svg" width={32} height={32} alt="Tempel logo" />
        <div className="text-[22px] font-bold text-[var(--tempel-ink)]">Tempel</div>
      </nav>
      <section className="flex flex-col gap-6 p-6 md:p-24">
        <RevealView id={id} />
      </section>
    </main>
  );
}
