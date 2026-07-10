import { TrackerApp } from "@/components/TrackerApp";
import type { RailGraphData } from "@/lib/railGraph";
import graphData from "@/data/rail-graph.json";

export const metadata = { title: "Stay — outreach tracker" };

export default function TrackerPage() {
  return <TrackerApp graphData={graphData as unknown as RailGraphData} />;
}
