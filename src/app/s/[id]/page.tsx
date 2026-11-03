import { RevealView } from "../reveal-view";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="bg-white">
      <nav className="p-5">
        <div className="text-[22px] font-bold text-[#1A1A1A]">Tempel</div>
      </nav>
      <section className="flex flex-col gap-6 p-6 md:p-24">
        <RevealView id={id} />
      </section>
    </main>
  );
}
