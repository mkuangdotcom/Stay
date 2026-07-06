"use client";

import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";
import { ROOM_TYPE_LABELS, SOURCE_LABELS } from "@/lib/types";
import type { Commute } from "@/lib/railGraph";
import { RouteStrip } from "./RouteStrip";

export function DetailPanel({
  listing: l,
  commute,
  onClose,
  onToggleFav,
  lineColors,
  lineNames,
  isGuest = false,
}: {
  listing: Listing;
  commute: Commute | null;
  onClose: () => void;
  onToggleFav: (id: string) => void;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
  isGuest?: boolean;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const photos = l.photos.filter(Boolean);

  return (
    <div className="pointer-events-auto flex max-h-[calc(100%-24px)] w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-edge bg-ink shadow-2xl">
      {photos.length > 0 && (
        <div className="relative h-[180px] shrink-0 bg-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[photoIdx]}
            alt={l.title}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
          {photos.length > 1 && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => setPhotoIdx(i)}
                  className={`h-1.5 w-1.5 rounded-full ${i === photoIdx ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[14px] font-semibold leading-snug">{l.title}</h2>
          <div className="flex shrink-0 items-center gap-1">
            {!isGuest && (
              <button
                onClick={() => onToggleFav(l.id)}
                aria-label={l.isFav ? "Remove star" : "Star listing"}
                className={`grid h-6 w-6 place-items-center rounded-md text-[15px] hover:bg-panel ${
                  l.isFav ? "text-accent" : "text-muted hover:text-text"
                }`}
              >
                {l.isFav ? "★" : "☆"}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-panel hover:text-text"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-[22px] font-semibold leading-none">
            <span className="text-[12px] font-normal text-muted">RM</span>
            {l.priceRm.toLocaleString()}
          </span>
          <span className="text-[11px] text-muted">/ month</span>
          <span className="ml-auto rounded-md bg-panel px-2 py-0.5 text-[11px] text-muted">
            {ROOM_TYPE_LABELS[l.roomType]}
          </span>
        </div>

        {commute && (
          <div className="mt-3 rounded-lg bg-panel p-2.5">
            <div className="label mb-1.5">Door to door</div>
            <RouteStrip commute={commute} lineColors={lineColors} lineNames={lineNames} />
            {commute.boardStationName && (
              <p className="mt-1.5 text-[11px] text-muted">
                {Math.round(commute.walkMin)} min walk to {commute.boardStationName}
                {!commute.walkRouted && <span className="text-faint"> (estimate)</span>}
              </p>
            )}
          </div>
        )}

        <PriceHistorySection key={l.id} id={l.id} />

        <dl className="mt-3 space-y-1.5 text-[12px]">
          {l.propertyName && <Row k="Property" v={l.propertyName} />}
          {l.area && <Row k="Area" v={l.area} />}
          {l.address && <Row k="Address" v={l.address} />}
          {l.furnished && <Row k="Furnishing" v={l.furnished} />}
          {l.gender && <Row k="Tenant" v={l.gender === "female" ? "Female only" : "Male only"} />}
          {l.minTermMonths !== null && (
            <Row
              k="Min stay"
              v={l.minTermMonths <= 1 ? "Short-term OK" : `${l.minTermMonths} months`}
            />
          )}
          {l.availableFrom && <Row k="Available" v={l.availableFrom} />}
          <Row k="Source" v={SOURCE_LABELS[l.source]} />
          <Row k="Last seen" v={new Date(l.lastSeen).toLocaleDateString("en-MY")} />
        </dl>

        {l.notes && (
          <p className="mt-3 rounded-lg bg-panel p-2.5 text-[12px] leading-relaxed text-muted">
            {l.notes}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {l.url && (
            <a href={l.url} target="_blank" rel="noreferrer" className="btn btn-accent flex-1">
              Open listing ↗
            </a>
          )}
          {!isGuest && (
            <a href={`/admin?edit=${l.id}`} className="btn">
              Edit
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

type PricePoint = { priceRm: number; seenAt: string };

/** Collapsed by default; fetches history on first open. */
function PriceHistorySection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<PricePoint[] | null>(null);

  useEffect(() => {
    if (!open || points !== null) return;
    let stale = false;
    fetch(`/api/listings/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!stale) setPoints(d.points ?? []);
      })
      .catch(() => {
        if (!stale) setPoints([]);
      });
    return () => {
      stale = true;
    };
  }, [open, points, id]);

  return (
    <div className="mt-3">
      <button
        className="btn w-full justify-between text-[12px]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Price history</span>
        <span className="text-faint">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-panel p-2.5">
          {points === null ? (
            <p className="py-3 text-center text-[11px] text-faint">Loading…</p>
          ) : points.length === 0 ? (
            <p className="py-2 text-[11px] text-faint">No history recorded for this listing.</p>
          ) : points.length === 1 ? (
            <p className="py-1 text-[12px] text-muted">
              No price changes —{" "}
              <span className="font-mono text-text">RM{points[0].priceRm.toLocaleString()}</span>{" "}
              since {new Date(points[0].seenAt).toLocaleDateString("en-MY")}
            </p>
          ) : (
            <PriceStepChart points={points} />
          )}
        </div>
      )}
    </div>
  );
}

/** Step line: prices hold between observations, so steps are the honest form. */
function PriceStepChart({ points }: { points: PricePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 292, H = 108, L = 42, R = 10, T = 12, B = 20;

  const t0 = new Date(points[0].seenAt).getTime();
  const t1 = Date.now(); // price still current → extend the last step to today
  const prices = points.map((p) => p.priceRm);
  let lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.02);
  lo -= pad; hi += pad;

  const x = (iso: string | number) =>
    L + ((typeof iso === "number" ? iso : new Date(iso).getTime()) - t0) / Math.max(t1 - t0, 1) * (W - L - R);
  const y = (rm: number) => T + (1 - (rm - lo) / (hi - lo)) * (H - T - B);

  let d = `M ${x(points[0].seenAt)} ${y(points[0].priceRm)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${x(points[i].seenAt)} V ${y(points[i].priceRm)}`;
  }
  d += ` H ${x(t1)}`;

  const first = points[0].priceRm, last = points[points.length - 1].priceRm;
  const delta = last - first;
  const fmt = (n: number) => `RM${n.toLocaleString()}`;
  const day = (iso: string | number) =>
    new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short" });

  return (
    <div className="relative">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">Asking price</span>
        <span
          className={`font-mono text-[11px] ${delta === 0 ? "text-muted" : delta < 0 ? "text-good" : "text-bad"}`}
        >
          {delta === 0 ? "unchanged" : `${delta < 0 ? "▼" : "▲"} ${fmt(Math.abs(delta))}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price history chart">
        {/* recessive grid: min & max */}
        {[hi - pad, lo + pad].map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--edge)" strokeWidth="1" />
            <text x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="monospace">
              {fmt(v)}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke="#5b8def" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.seenAt)} cy={y(p.priceRm)} r="3.5" fill="#5b8def" stroke="var(--panel)" strokeWidth="2" />
            {/* oversized invisible hit target */}
            <circle
              cx={x(p.seenAt)} cy={y(p.priceRm)} r="10" fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        <text x={L} y={H - 6} fontSize="9" fill="var(--faint)">{day(points[0].seenAt)}</text>
        <text x={W - R} y={H - 6} fontSize="9" fill="var(--faint)" textAnchor="end">today</text>
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-edge bg-panel-2 px-2 py-1 font-mono text-[10.5px] text-text shadow-lg"
          style={{
            left: `${(x(points[hover].seenAt) / W) * 100}%`,
            top: Math.max(y(points[hover].priceRm) - 34, 0),
          }}
        >
          {fmt(points[hover].priceRm)} · {day(points[hover].seenAt)}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-faint">{k}</dt>
      <dd className="truncate text-right text-muted">{v}</dd>
    </div>
  );
}
