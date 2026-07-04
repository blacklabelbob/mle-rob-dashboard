import NetworkGraph from "@/components/NetworkGraph";

export const dynamic = "force-dynamic";

export default function NetworkPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">The Network</h1>
        <p className="mt-1 text-sm text-slate-400">
          Lit nodes pay and refer. The job of the whole business is to light the rest — every lit
          node makes its neighbors easier to light.
        </p>
      </div>
      <NetworkGraph />
    </div>
  );
}
