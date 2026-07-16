"use client";

import { useEffect, useMemo, useState } from "react";
import { emptyOutreach, type Listing, type Outreach, type WalkCache } from "@/lib/types";
import {
  RailGraph,
  stripBus,
  type Commute,
  type RailData,
  type RailGraphData,
} from "@/lib/railGraph";
import {
  HEAT_MAX_MIN,
  HEAT_MIN_MIN,
  HEAT_STEP_MIN,
  travelTimeSurface,
} from "@/lib/travelTime";
import { applyFilters, DEFAULT_FILTERS, quantile, type FilterState } from "@/lib/filters";
import { MapView, type ColorMode, type ListingPoint } from "./MapView";
import { Sidebar, type SortMode } from "./Sidebar";
import { DetailPanel } from "./DetailPanel";
import { LineChips } from "./LineChips";
import { BUS_KEY, DEFAULT_OFFICE, OFFICE_KEY } from "@/lib/office";

const HEAT_KEY = "stay.zones"; // key kept from the old Zones toggle
const HEAT_MAX_KEY = "stay.heatmap-max";
const WIDTH_KEY = "stay.sidebar-width";

export function MapApp({ rail, graphData }: { rail: RailData; graphData: RailGraphData }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [walkCache, setWalkCache] = useState<WalkCache>({});
  const [outreach, setOutreach] = useState<Record<string, Outreach>>({});
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortMode>("commute");
  const [colorMode, setColorMode] = useState<ColorMode>("commute");
  const [visibleLines, setVisibleLines] = useState<string[]>(rail.lines.map((l) => l.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [office, setOffice] = useState(DEFAULT_OFFICE);
  const [officeLabel, setOfficeLabel] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [busEnabled, setBusEnabled] = useState(true);
  const [heatEnabled, setHeatEnabled] = useState(false);
  const [heatMax, setHeatMax] = useState(60);
  const [sidebarWidth, setSidebarWidth] = useState(360);

  /* restore office pin + layer preferences */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(OFFICE_KEY);
      if (saved) {
        const { lat, lng, label } = JSON.parse(saved);
        setOffice({ lat, lng });
        setOfficeLabel(label ?? null);
      }
      if (localStorage.getItem(BUS_KEY) === "off") setBusEnabled(false);
      if (localStorage.getItem(HEAT_KEY) === "on") setHeatEnabled(true);
      const hm = Number(localStorage.getItem(HEAT_MAX_KEY));
      if (hm >= HEAT_MIN_MIN && hm <= HEAT_MAX_MIN) setHeatMax(hm);
      const w = Number(localStorage.getItem(WIDTH_KEY));
      if (w >= 300 && w <= 560) setSidebarWidth(w);
    } catch {}
  }, []);

  const startSidebarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const clamp = (x: number) => Math.min(560, Math.max(300, x));
    const move = (ev: PointerEvent) => setSidebarWidth(clamp(ev.clientX));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      localStorage.setItem(WIDTH_KEY, String(clamp(ev.clientX)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const toggleHeat = () => {
    setHeatEnabled((v) => {
      localStorage.setItem(HEAT_KEY, v ? "off" : "on");
      return !v;
    });
  };
  const changeHeatMax = (v: number) => {
    setHeatMax(v);
    localStorage.setItem(HEAT_MAX_KEY, String(v));
  };
  const toggleBus = () => {
    setBusEnabled((v) => {
      localStorage.setItem(BUS_KEY, v ? "off" : "on");
      return !v;
    });
  };
  const toggleFav = (id: string) => {
    const cur = listings.find((x) => x.id === id)?.isFav ?? false;
    setListings((ls) => ls.map((l) => (l.id === id ? { ...l, isFav: !cur } : l)));
    fetch(`/api/listings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFav: !cur }),
    }).catch(() => {});
  };

  /** Merge a patch into a listing's outreach record (creating it) and persist. */
  const saveOutreach = (listingId: string, patch: Partial<Outreach>) => {
    const next: Outreach = {
      ...emptyOutreach(listingId),
      ...outreach[listingId],
      ...patch,
      listingId,
      updatedAt: new Date().toISOString(),
    };
    setOutreach((m) => ({ ...m, [listingId]: next }));
    fetch("/api/outreach", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  };

  const untrack = (listingId: string) => {
    setOutreach((m) => {
      const rest = { ...m };
      delete rest[listingId];
      return rest;
    });
    fetch(`/api/outreach?listingId=${encodeURIComponent(listingId)}`, { method: "DELETE" }).catch(
      () => {}
    );
  };

  const moveOffice = (pos: { lat: number; lng: number }, label?: string) => {
    setOffice(pos);
    setOfficeLabel(label ?? null);
    localStorage.setItem(OFFICE_KEY, JSON.stringify({ ...pos, label }));
  };

  /* data */
  useEffect(() => {
    fetch("/api/listings")
      .then((r) => r.json())
      .then((d) => {
        setListings(d.listings ?? []);
        setWalkCache(d.walkCache ?? {});
      })
      .catch(() => {})
      .finally(() => setListingsLoaded(true));
    fetch("/api/outreach")
      .then((r) => r.json())
      .then((d) =>
        setOutreach(
          Object.fromEntries(((d.outreach ?? []) as Outreach[]).map((o) => [o.listingId, o]))
        )
      )
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login";
  };

  /* commute engine — buses in the graph are opt-out via the map chip */
  const graph = useMemo(
    () => new RailGraph(busEnabled ? graphData : stripBus(graphData)),
    [graphData, busEnabled]
  );
  const routing = useMemo(() => graph.routeToOffice(office), [graph, office]);
  const heatData = useMemo(
    () => (heatEnabled ? travelTimeSurface(graph, routing) : null),
    [graph, routing, heatEnabled]
  );
  const commutes = useMemo(() => {
    const m = new Map<string, Commute | null>();
    for (const l of listings) {
      m.set(l.id, graph.commuteFrom(l.lat, l.lng, routing, walkCache[l.id]));
    }
    return m;
  }, [listings, graph, routing, walkCache]);

  const filtered = useMemo(
    () => applyFilters(listings, commutes, outreach, filters),
    [listings, commutes, outreach, filters]
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
        approx: l.source === "mudah",
      })),
    [filtered, commutes]
  );

  const selected = selectedId ? listings.find((l) => l.id === selectedId) ?? null : null;
  const allLines = useMemo(() => [...rail.lines, ...(rail.busLines ?? [])], [rail]);
  const lineColors = useMemo(
    () => Object.fromEntries(allLines.map((l) => [l.id, l.color])),
    [allLines]
  );
  const lineNames = useMemo(
    () => Object.fromEntries(allLines.map((l) => [l.id, l.name])),
    [allLines]
  );

  const officeIsDefault =
    Math.abs(office.lat - DEFAULT_OFFICE.lat) < 1e-6 &&
    Math.abs(office.lng - DEFAULT_OFFICE.lng) < 1e-6;

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <div
        className={`relative h-full transition-transform max-md:absolute max-md:z-30 ${
          sidebarOpen ? "" : "max-md:-translate-x-full md:hidden"
        }`}
        style={{ width: `min(${sidebarWidth}px, 92vw)` }}
      >
        {/* collapse — floats just outside the sidebar edge, above everything */}
        {sidebarOpen && (
          <button
            className="btn absolute -right-9 top-3 z-20 px-2"
            onClick={() => setSidebarOpen(false)}
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            ‹
          </button>
        )}
        {/* drag to resize (desktop) */}
        <div
          className="absolute -right-0.5 top-0 z-10 hidden h-full w-2 cursor-col-resize hover:bg-accent/40 md:block"
          onPointerDown={startSidebarResize}
          role="separator"
          aria-label="Resize sidebar"
        />
        <Sidebar
          filters={filters}
          onFilters={setFilters}
          listings={sorted}
          totalCount={listings.length}
          commutes={commutes}
          outreach={outreach}
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
          officeLabel={officeLabel}
          onMoveOffice={moveOffice}
          onToggleFav={toggleFav}
          onOutreach={saveOutreach}
          onUntrack={untrack}
          onResetOffice={() => moveOffice(DEFAULT_OFFICE)}
          lineColors={lineColors}
          lineNames={lineNames}
          loaded={listingsLoaded}
          onSignOut={signOut}
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
          busVisible={busEnabled}
          heatmap={heatData}
          heatmapMax={heatMax}
          onSelect={setSelectedId}
          onOfficeMove={moveOffice}
        />

        {/* overlays */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {!sidebarOpen && (
              <button
                className="btn pointer-events-auto"
                onClick={() => setSidebarOpen(true)}
                aria-label="Show sidebar"
                title="Show sidebar"
              >
                ☰
              </button>
            )}
            <div className="flex flex-col items-start gap-2">
              <LineChips
                lines={rail.lines}
                visible={visibleLines}
                onChange={setVisibleLines}
                hasBus={(rail.busLines?.length ?? 0) > 0}
                busEnabled={busEnabled}
                onToggleBus={toggleBus}
                heatEnabled={heatEnabled}
                onToggleHeat={toggleHeat}
              />
              {heatEnabled && (
                <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-edge bg-ink/90 px-2.5 py-2 shadow-lg backdrop-blur">
                  <span className="whitespace-nowrap font-mono text-[10.5px] text-muted">
                    ≤ {heatMax} min
                  </span>
                  <input
                    type="range"
                    min={HEAT_MIN_MIN}
                    max={HEAT_MAX_MIN}
                    step={HEAT_STEP_MIN}
                    value={heatMax}
                    onChange={(e) => changeHeatMax(Number(e.target.value))}
                    aria-label="Maximum commute minutes shown on the heatmap"
                    className="w-36 accent-accent"
                  />
                </div>
              )}
            </div>
          </div>
          {selected && (
            <DetailPanel
              listing={selected}
              commute={commutes.get(selected.id) ?? null}
              outreach={outreach[selected.id] ?? null}
              onOutreach={(patch) => saveOutreach(selected.id, patch)}
              onUntrack={() => untrack(selected.id)}
              onClose={() => setSelectedId(null)}
              onToggleFav={toggleFav}
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
