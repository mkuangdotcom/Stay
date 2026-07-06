"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Listing, RoomType, Source } from "@/lib/types";
import { ROOM_TYPE_LABELS, SOURCE_LABELS } from "@/lib/types";
import type { FilterState } from "@/lib/filters";
import type { Commute } from "@/lib/railGraph";
import { StatsPanel } from "./StatsPanel";
import { RouteStrip } from "./RouteStrip";
import type { ColorMode } from "./MapView";

export type SortMode = "commute" | "price" | "newest";

const ROOM_TYPES: RoomType[] = ["master", "medium", "small", "studio", "unit"];
const SOURCES: Source[] = ["ibilik", "mudah", "speedhome", "facebook", "manual"];

interface Props {
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  listings: Listing[]; // filtered
  totalCount: number;
  commutes: Map<string, Commute | null>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  colorMode: ColorMode;
  onColorMode: (m: ColorMode) => void;
  officeIsDefault: boolean;
  officeLabel: string | null;
  onMoveOffice: (pos: { lat: number; lng: number }, label?: string) => void;
  onToggleFav: (id: string) => void;
  onResetOffice: () => void;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
  onClose: () => void;
  isGuest: boolean;
  loaded: boolean;
  onSignOut: () => void;
}

export function Sidebar(p: Props) {
  const f = p.filters;
  const set = (patch: Partial<FilterState>) => p.onFilters({ ...f, ...patch });

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <aside className="flex h-full w-full flex-col border-r border-edge bg-ink">
      {/* brand */}
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h1 className="text-[17px] font-bold tracking-[0.14em]">
          STAY<span className="text-accent">.</span>
        </h1>
        <div className="flex items-center gap-2">
          {!p.isGuest && (
            <Link href="/admin" className="btn text-[12px]">
              + Add listing
            </Link>
          )}
          <button
            className="btn px-2 text-[11px] text-muted"
            onClick={p.onSignOut}
            title={p.isGuest ? "Signed in as guest" : "Sign out"}
          >
            {p.isGuest ? "Guest ⏻" : "⏻"}
          </button>
          <button
            className="btn px-2.5 md:hidden"
            onClick={p.onClose}
            aria-label="Show the map"
          >
            Map ›
          </button>
        </div>
      </header>

      {/* destination */}
      <div className="border-b border-edge px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="label">Commute to</span>
          {!p.officeIsDefault && (
            <button className="text-[11px] text-accent hover:underline" onClick={p.onResetOffice}>
              Reset to First Avenue
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12.5px]">
          <span className="inline-block h-[10px] w-[10px] rounded-full bg-accent ring-2 ring-accent/30" />
          {p.officeIsDefault ? (
            <span>First Avenue, Bandar Utama</span>
          ) : (
            <span className="truncate">{p.officeLabel ?? "Custom pin"}</span>
          )}
        </div>
        <DestinationSearch onPick={p.onMoveOffice} />
      </div>

      {/* filters */}
      <div className="border-b border-edge px-4 py-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="price-min">Rent RM</label>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                id="price-min"
                type="number"
                className="field font-mono"
                placeholder="min"
                value={f.priceMin ?? ""}
                onChange={(e) => set({ priceMin: e.target.value ? +e.target.value : null })}
              />
              <span className="text-faint">–</span>
              <input
                type="number"
                className="field font-mono"
                placeholder="max"
                aria-label="Maximum rent"
                value={f.priceMax ?? ""}
                onChange={(e) => set({ priceMax: e.target.value ? +e.target.value : null })}
              />
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ROOM_TYPES.map((t) => (
            <button
              key={t}
              className="chip"
              data-on={f.roomTypes.includes(t)}
              onClick={() => set({ roomTypes: toggle(f.roomTypes, t) })}
            >
              {ROOM_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between">
              <label className="label" htmlFor="walk-max">Walk to rail</label>
              <span className="font-mono text-[11px] text-muted">
                {f.maxWalkMin === null ? "any" : `≤${f.maxWalkMin}m`}
              </span>
            </div>
            <input
              id="walk-max"
              type="range"
              min={3}
              max={31}
              step={1}
              className="mt-1 w-full"
              value={f.maxWalkMin ?? 31}
              onChange={(e) => set({ maxWalkMin: +e.target.value >= 31 ? null : +e.target.value })}
            />
          </div>
          <div>
            <div className="flex justify-between">
              <label className="label" htmlFor="commute-max">Door to door</label>
              <span className="font-mono text-[11px] text-muted">
                {f.maxCommuteMin === null ? "any" : `≤${f.maxCommuteMin}m`}
              </span>
            </div>
            <input
              id="commute-max"
              type="range"
              min={10}
              max={95}
              step={5}
              className="mt-1 w-full"
              value={f.maxCommuteMin ?? 95}
              onChange={(e) =>
                set({ maxCommuteMin: +e.target.value >= 95 ? null : +e.target.value })
              }
            />
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            type="search"
            className="field"
            placeholder="Search condo, area, notes…"
            value={f.keyword}
            onChange={(e) => set({ keyword: e.target.value })}
          />
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="label">I am</span>
          {(["female", "male"] as const).map((g) => (
            <button
              key={g}
              className="chip"
              data-on={f.tenant === g}
              onClick={() => set({ tenant: f.tenant === g ? null : g })}
              title={`Hide listings restricted to ${g === "female" ? "men" : "women"}`}
            >
              {g === "female" ? "♀ Female" : "♂ Male"}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="label">Stay ≤</span>
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              className="chip"
              data-on={f.maxTermMonths === m}
              onClick={() => set({ maxTermMonths: f.maxTermMonths === m ? null : m })}
              title={`Hide listings demanding more than ${m} months`}
            >
              {m}mo
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="label">Posted</span>
          {[1, 3, 7, 30].map((d) => (
            <button
              key={d}
              className="chip"
              data-on={f.maxAgeDays === d}
              onClick={() => set({ maxAgeDays: f.maxAgeDays === d ? null : d })}
            >
              {d === 1 ? "24h" : `≤${d}d`}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s}
              className="chip"
              data-on={f.sources.includes(s)}
              onClick={() => set({ sources: toggle(f.sources, s) })}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
          <button
            className="chip ml-auto"
            data-on={!f.activeOnly}
            onClick={() => set({ activeOnly: !f.activeOnly })}
            title="Include listings that have disappeared from their source"
          >
            Show gone
          </button>
        </div>
      </div>

      {/* stats */}
      <StatsPanel listings={p.listings} commutes={p.commutes} />

      {/* list */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 border-t border-edge px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="label">
            {p.listings.length} of {p.totalCount}
          </span>
          {!p.isGuest && (
            <button
              className="chip"
              data-on={f.favOnly}
              onClick={() => set({ favOnly: !f.favOnly })}
              title="Show only starred listings"
            >
              ★ Favs
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            className="field w-auto py-1 text-[11.5px]"
            value={p.sort}
            aria-label="Sort listings"
            onChange={(e) => p.onSort(e.target.value as SortMode)}
          >
            <option value="commute">Shortest commute</option>
            <option value="price">Cheapest first</option>
            <option value="newest">Newest first</option>
          </select>
          <select
            className="field w-auto py-1 text-[11.5px]"
            value={p.colorMode}
            aria-label="Color pins by"
            onChange={(e) => p.onColorMode(e.target.value as ColorMode)}
          >
            <option value="commute">Color: commute</option>
            <option value="price">Color: price</option>
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {p.listings.map((l) => (
          <ListingRow
            key={l.id}
            listing={l}
            commute={p.commutes.get(l.id) ?? null}
            selected={l.id === p.selectedId}
            onClick={() => p.onSelect(l.id)}
            onToggleFav={() => p.onToggleFav(l.id)}
            showFav={!p.isGuest}
            lineColors={p.lineColors}
            lineNames={p.lineNames}
          />
        ))}
        {p.listings.length === 0 && (
          <p className="px-4 py-6 text-center text-[12px] text-faint">
            {p.loaded ? "No listings match." : "Loading…"}
          </p>
        )}
      </div>
    </aside>
  );
}

function ListingRow({
  listing: l,
  commute,
  selected,
  onClick,
  onToggleFav,
  showFav,
  lineColors,
  lineNames,
}: {
  listing: Listing;
  commute: Commute | null;
  selected: boolean;
  onClick: () => void;
  onToggleFav: () => void;
  showFav: boolean;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full border-b border-edge/60 px-4 py-2.5 text-left transition-colors hover:bg-panel ${
        selected ? "bg-panel" : ""
      } ${l.isActive ? "" : "opacity-50"}`}
      aria-pressed={selected}
    >
      <div className="flex items-baseline justify-between gap-2">
        {showFav && (
        <span
          role="button"
          tabIndex={0}
          aria-label={l.isFav ? "Remove star" : "Star listing"}
          className={`shrink-0 cursor-pointer text-[13px] leading-none ${
            l.isFav ? "text-accent" : "text-faint hover:text-muted"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleFav();
            }
          }}
        >
          {l.isFav ? "★" : "☆"}
        </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
          {l.propertyName || l.title}
        </span>
        <span className="shrink-0 font-mono text-[13px] font-semibold">
          <span className="text-[9.5px] font-normal text-muted">RM</span>
          {l.priceRm.toLocaleString()}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
        <span>{ROOM_TYPE_LABELS[l.roomType]}</span>
        <span>·</span>
        <span className="truncate">{l.area ?? SOURCE_LABELS[l.source]}</span>
        {l.gender && <span className="shrink-0">· {l.gender === "female" ? "♀" : "♂"} only</span>}
        {l.minTermMonths !== null && l.minTermMonths > 1 && (
          <span className="shrink-0">· {l.minTermMonths}mo min</span>
        )}
        {l.isActive && Date.now() - new Date(l.firstSeen).getTime() < 864e5 && (
          <span className="ml-auto shrink-0 rounded bg-[#22a06b]/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-[#3ecf8e]">
            new
          </span>
        )}
        {!l.isActive && (
          <span className="ml-auto shrink-0 rounded bg-panel-2 px-1.5 py-px text-[9.5px] uppercase tracking-wide">
            gone
          </span>
        )}
      </div>
      {commute && (
        <div className="mt-1.5">
          <RouteStrip commute={commute} lineColors={lineColors} lineNames={lineNames} />
        </div>
      )}
    </button>
  );
}

/* Address search that moves the commute destination (Nominatim via /api/geocode). */
function DestinationSearch({
  onPick,
}: {
  onPick: (pos: { lat: number; lng: number }, label?: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    let stale = false;
    const t = setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!stale) setResults(d.results ?? []);
        })
        .catch(() => {
          if (!stale) setResults([]);
        })
        .finally(() => {
          if (!stale) setBusy(false);
        });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="relative mt-1.5">
      <input
        className="field w-full"
        placeholder="Search address or place…"
        aria-label="Search a destination address"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {busy && <span className="absolute right-2.5 top-1.5 text-[11px] text-faint">…</span>}
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-52 overflow-auto rounded-lg border border-edge bg-ink shadow-lg">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-2.5 py-1.5 text-left text-[12px] hover:bg-white/5"
                onClick={() => {
                  onPick({ lat: r.lat, lng: r.lng }, r.name.split(",").slice(0, 2).join(","));
                  setQ("");
                  setResults([]);
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
