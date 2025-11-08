import { ZeroLagMacdChart } from "@/components/ZeroLagMacdChart";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 py-12">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <ZeroLagMacdChart />
      </div>
    </main>
  );
}
