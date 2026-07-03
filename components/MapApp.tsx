"use client";

import { useEffect, useMemo, useState } from "react";
import type { Listing, WalkCache } from "@/lib/types";
import { RailGraph, type Commute, type RailData, type RailGraphData } from "@/lib/railGraph";
import { applyFilters, DEFAULT_FILTERS, quantile, type FilterState } from "@/lib/filters";
import { MapView, type ColorMode, type ListingPoint } from "./MapView";
import { Sidebar, type SortMode } from "./Sidebar";
import { DetailPanel } from "./DetailPanel";
import { LineChips } from "./LineChips";

export const DEFAULT_OFFICE = { lat: 3.1458775, lng: 101.6173708 }; // First Avenue, Bandar Utama
const OFFICE_KEY = "stay.office";

export function MapApp({ rail, graphData }: { rail: RailData; graphData: RailGraphData }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [walkCache, setWalkCache] = useState<WalkCache>({});
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortMode>("commute");
  const [colorMode, setColorMode] = useState<ColorMode>("commute");
  const [visibleLines, setVisibleLines] = useState<string[]>(rail.lines.map((l) => l.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [office, setOffice] = useState(DEFAULT_OFFICE);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* restore office pin */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(OFFICE_KEY);
      if (saved) setOffice(JSON.parse(saved));
    } catch {}
  }, []);
  const moveOffice = (pos: { lat: number; lng: number }) => {
    setOffice(pos);
    localStorage.setItem(OFFICE_KEY, JSON.stringify(pos));
  };

  /* data */
  useEffect(() => {
    fetch("/api/listings")
      .then((r) => r.json())
      .then((d) => {
        setListings(d.listings ?? []);
        setWalkCache(d.walkCache ?? {});
      })
      .catch(() => {});
  }, []);

  /* commute engine */
  const graph = useMemo(() => new RailGraph(graphData), [graphData]);
  const routing = useMemo(() => graph.routeToOffice(office), [graph, office]);
  const commutes = useMemo(() => {
    const m = new Map<string, Commute | null>();
    for (const l of listings) {
      m.set(l.id, graph.commuteFrom(l.lat, l.lng, routing, walkCache[l.id]));
    }
    return m;
  }, [listings, graph, routing, walkCache]);

  const filtered = useMemo(
    () => applyFilters(listings, commutes, filters),
    [listings, commutes, filters]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "price") arr.sort((a, b) => a.priceRm - b.priceRm);
    else if (sort === "newest") arr.sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1));
    else
      arr.sort(
        (a, b) =>
          (commutes.get(a.id)?.totalMin ?? Infinity) - (commutes.get(b.id)?.totalMin ?? Infinity)
      );
    return arr;
  }, [filtered, sort, commutes]);

  const priceStops = useMemo<[number, number, number]>(() => {
    const ps = filtered.map((l) => l.priceRm).filter((p) => p > 0).sort((a, b) => a - b);
    if (ps.length < 3) return [500, 1200, 2500];
    const a = quantile(ps, 0.2), b = quantile(ps, 0.55), c = quantile(ps, 0.9);
    return c - a < 1 ? [a - 1, a, a + 1] : [a, Math.max(b, a + 1), Math.max(c, b + 2)];
  }, [filtered]);

  const points = useMemo<ListingPoint[]>(
    () =>
      filtered.map((l) => ({
        id: l.id,
        lat: l.lat,
        lng: l.lng,
        price: l.priceRm,
        commute: commutes.get(l.id) ? Math.round(commutes.get(l.id)!.totalMin) : -1,
        active: l.isActive,
      })),
    [filtered, commutes]
  );

  const selected = selectedId ? listings.find((l) => l.id === selectedId) ?? null : null;
  const lineColors = useMemo(
    () => Object.fromEntries(rail.lines.map((l) => [l.id, l.color])),
    [rail.lines]
  );
  const lineNames = useMemo(
    () => Object.fromEntries(rail.lines.map((l) => [l.id, l.name])),
    [rail.lines]
  );

  const officeIsDefault =
    Math.abs(office.lat - DEFAULT_OFFICE.lat) < 1e-6 &&
    Math.abs(office.lng - DEFAULT_OFFICE.lng) < 1e-6;

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <div
        className={`h-full transition-transform max-md:absolute max-md:z-30 ${
          sidebarOpen ? "" : "max-md:-translate-x-full"
        }`}
      >
        <Sidebar
          filters={filters}
          onFilters={setFilters}
          listings={sorted}
          totalCount={listings.length}
          commutes={commutes}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          sort={sort}
          onSort={setSort}
          colorMode={colorMode}
          onColorMode={setColorMode}
          officeIsDefault={officeIsDefault}
          onResetOffice={() => moveOffice(DEFAULT_OFFICE)}
          lineColors={lineColors}
          lineNames={lineNames}
        />
      </div>

      <main className="relative min-w-0 flex-1">
        <MapView
          rail={rail}
          visibleLines={visibleLines}
          listings={points}
          colorMode={colorMode}
          priceStops={priceStops}
          selected={selected ? { id: selected.id, lat: selected.lat, lng: selected.lng } : null}
          office={office}
          onSelect={setSelectedId}
          onOfficeMove={moveOffice}
        />

        {/* overlays */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <button
              className="btn pointer-events-auto md:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <LineChips lines={rail.lines} visible={visibleLines} onChange={setVisibleLines} />
          </div>
          {selected && (
            <DetailPanel
              listing={selected}
              commute={commutes.get(selected.id) ?? null}
              onClose={() => setSelectedId(null)}
              lineColors={lineColors}
              lineNames={lineNames}
            />
          )}
        </div>

        {/* ramp legend */}
        <div className="pointer-events-none absolute bottom-6 left-3 rounded-lg border border-edge bg-ink/90 px-2.5 py-1.5 backdrop-blur">
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="font-mono">
              {colorMode === "commute" ? "20m" : `RM${Math.round(priceStops[0])}`}
            </span>
            <span
              className="h-[6px] w-[72px] rounded-full"
              style={{
                background: "linear-gradient(90deg,#22a06b,#e7a100,#d64550)",
              }}
            />
            <span className="font-mono">
              {colorMode === "commute" ? "65m+" : `RM${Math.round(priceStops[2])}`}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
