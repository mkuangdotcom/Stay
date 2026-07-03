import { MapApp } from "@/components/MapApp";
import type { RailData, RailGraphData } from "@/lib/railGraph";
import rail from "@/data/rail.json";
import graphData from "@/data/rail-graph.json";

export default function Home() {
  return (
    <MapApp rail={rail as unknown as RailData} graphData={graphData as unknown as RailGraphData} />
  );
}
