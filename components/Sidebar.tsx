"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Listing, Outreach, OutreachStatus, RoomType, Source } from "@/lib/types";
import { OUTREACH_STATUS_LABELS, ROOM_TYPE_LABELS, SOURCE_LABELS } from "@/lib/types";
import type { FilterState } from "@/lib/filters";
import type { Commute } from "@/lib/railGraph";
import { StatsPanel } from "./StatsPanel";
import { RouteStrip } from "./RouteStrip";
import type { ColorMode } from "./MapView";

export type SortMode = "commute" | "price" | "newest";

const ROOM_TYPES: RoomType[] = ["master", "medium", "small", "studio", "unit"];
const SOURCES: Source[] = ["ibilik", "mudah", "speedhome", "facebook", "manual"];
const OUTREACH_STATUSES = Object.keys(OUTREACH_STATUS_LABELS) as OutreachStatus[];

interface Props {
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  listings: Listing[]; // filtered
  totalCount: number;
  commutes: Map<string, Commute | null>;
  outreach: Record<string, Outreach>;
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
  onOutreach: (id: string, patch: Partial<Outreach>) => void;
  onUntrack: (id: string) => void;
  onResetOffice: () => void;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
  loaded: boolean;
  onSignOut: () => void;
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
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
        <div className="flex items-center gap-1.5">
          <Link href="/tracker" className="btn text-[12px]">
            Tracker
          </Link>
          <Link href="/admin" className="btn text-[12px]">
            + Add
          </Link>
          <button
            className="btn px-2 text-muted hover:text-text"
            onClick={p.onSignOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogoutIcon />
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

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="label">Tracker</span>
          <button
            className="chip"
            data-on={f.trackedOnly && f.outreachStatuses.length === 0}
            onClick={() => set({ trackedOnly: !f.trackedOnly, outreachStatuses: [] })}
            title="Only listings in the tracker, any stage"
          >
            Any stage
          </button>
          {OUTREACH_STATUSES.map((s) => (
            <button
              key={s}
              className="chip"
              data-on={f.outreachStatuses.includes(s)}
              onClick={() =>
                set({ outreachStatuses: toggle(f.outreachStatuses, s), trackedOnly: false })
              }
            >
              {OUTREACH_STATUS_LABELS[s]}
            </button>
          ))}
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
          <button
            className="chip"
            data-on={f.favOnly}
            onClick={() => set({ favOnly: !f.favOnly })}
            title="Show only starred listings"
          >
            ★ Favs
          </button>
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
            outreach={p.outreach[l.id] ?? null}
            selected={l.id === p.selectedId}
            onClick={() => p.onSelect(l.id)}
            onToggleFav={() => p.onToggleFav(l.id)}
            onOutreach={(patch) => p.onOutreach(l.id, patch)}
            onUntrack={() => p.onUntrack(l.id)}
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

const STATUS_COLORS: Record<Outreach["status"], string> = {
  contacted: "text-muted",
  replied: "text-good",
  viewing: "text-accent",
  contract: "text-good",
  dead: "text-faint line-through",
};

function ListingRow({
  listing: l,
  commute,
  outreach,
  selected,
  onClick,
  onToggleFav,
  onOutreach,
  onUntrack,
  lineColors,
  lineNames,
}: {
  listing: Listing;
  commute: Commute | null;
  outreach: Outreach | null;
  selected: boolean;
  onClick: () => void;
  onToggleFav: () => void;
  onOutreach: (patch: Partial<Outreach>) => void;
  onUntrack: () => void;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
}) {
  /* a <select> can't live inside a <button>, so the row is a div with button semantics */
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`block w-full cursor-pointer border-b border-edge/60 px-4 py-2.5 text-left transition-colors hover:bg-panel ${
        selected ? "bg-panel" : ""
      } ${l.isActive ? "" : "opacity-50"}`}
      aria-pressed={selected}
    >
      <div className="flex items-baseline justify-between gap-2">
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
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {l.isActive && Date.now() - new Date(l.firstSeen).getTime() < 864e5 && (
            <span className="rounded bg-[#22a06b]/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-[#3ecf8e]">
              new
            </span>
          )}
          {!l.isActive && (
            <span className="rounded bg-panel-2 px-1.5 py-px text-[9.5px] uppercase tracking-wide">
              gone
            </span>
          )}
          {/* quick add-to-tracker / stage change without opening the listing */}
          <select
            className={`max-w-[110px] cursor-pointer rounded border bg-transparent py-px pl-1 text-[10.5px] outline-none ${
              outreach
                ? `border-edge ${STATUS_COLORS[outreach.status]}`
                : "border-transparent text-faint hover:border-edge hover:text-muted"
            }`}
            value={outreach?.status ?? ""}
            aria-label="Tracker stage"
            title={outreach ? "Change tracker stage" : "Add to tracker"}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const v = e.target.value;
              if (v === "") onUntrack();
              else
                onOutreach({
                  status: v as OutreachStatus,
                  ...(outreach ? {} : { contactedAt: new Date().toISOString().slice(0, 10) }),
                });
            }}
          >
            <option value="">{outreach ? "untrack" : "+ track"}</option>
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OUTREACH_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </span>
      </div>
      {commute && (
        <div className="mt-1.5">
          <RouteStrip commute={commute} lineColors={lineColors} lineNames={lineNames} />
        </div>
      )}
    </div>
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
