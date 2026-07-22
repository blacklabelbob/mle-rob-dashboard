import { getStore } from "@/lib/storage";
import DealsBoard from "@/components/DealsBoard";
import type { Person } from "@/lib/types";

export const dynamic = "force-dynamic";

// Task 2.5: server side fetches the live rows; the board (columns, scoring,
// drag-to-persist) lives client-side in components/DealsBoard.tsx.

export default async function DealsPage() {
  const store = getStore();
  const [deals, network] = await Promise.all([store.listDeals(), store.getNetwork()]);
  const nameById = Object.fromEntries(network.people.map((p: Person) => [p.id, p.name]));
  return <DealsBoard initialDeals={deals} nameById={nameById} asOf={new Date().toISOString()} />;
}
