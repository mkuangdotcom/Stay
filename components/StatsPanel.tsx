"use client";

import { useMemo } from "react";
import type { Listing } from "@/lib/types";
import { median } from "@/lib/filters";
import type { Commute } from "@/lib/railGraph";

const BINS = 14;

/** Rents in the current filter: stat row, price histogram, by-station medians. */
export function StatsPanel({
  listings,
  commutes,
}: {
  listings: Listing[];
  commutes: Map<string, Commute | null>;
}) {
  const prices = useMemo(
    () => listings.map((l) => l.priceRm).filter((p) => p > 0),
    [listings]
  );

  const hist = useMemo(() => {
    if (prices.length < 2) return null;
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    if (hi === lo) return null;
    const bins = new Array(BINS).fill(0);
    for (const p of prices) {
      const i = Math.min(BINS - 1, Math.floor(((p - lo) / (hi - lo)) * BINS));
      bins[i]++;
    }
    return { bins, lo, hi, max: Math.max(...bins) };
  }, [prices]);

  const byStation = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const l of listings) {
      const c = commutes.get(l.id);
      if (!c || !c.boardStationName) continue;
      if (!groups.has(c.boardStationName)) groups.set(c.boardStationName, []);
      groups.get(c.boardStationName)!.push(l.priceRm);
    }
    return [...groups.entries()]
      .map(([name, ps]) => ({ name, n: ps.length, median: median(ps) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  }, [listings, commutes]);

  if (prices.length === 0) {
    return <p className="px-4 py-3 text-[12px] text-faint">No listings match the filters.</p>;
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="label">Rents in view</span>
        <span className="font-mono text-[11px] text-muted">{prices.length} listings</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Min" value={Math.min(...prices)} />
        <Stat label="Median" value={median(prices)} />
        <Stat label="Max" value={Math.max(...prices)} />
      </div>

      {hist && (
        <div className="mt-3">
          <div className="flex h-[44px] items-end gap-[2px]" role="img"
            aria-label={`Price distribution from RM${hist.lo} to RM${hist.hi}`}>
            {hist.bins.map((n, i) => {
              const from = Math.round(hist.lo + ((hist.hi - hist.lo) * i) / BINS);
              const to = Math.round(hist.lo + ((hist.hi - hist.lo) * (i + 1)) / BINS);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-[3px] bg-muted/60 transition-colors hover:bg-muted"
                  style={{ height: n === 0 ? 1 : `${Math.max((n / hist.max) * 100, 6)}%` }}
                  title={`RM${from}–${to}: ${n} listing${n === 1 ? "" : "s"}`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
            <span>RM{Math.round(hist.lo)}</span>
            <span>RM{Math.round(hist.hi)}</span>
          </div>
        </div>
      )}

      {byStation.length > 0 && (
        <table className="mt-3 w-full text-[11.5px]">
          <thead>
            <tr className="label">
              <th className="pb-1 text-left font-semibold">Nearest station</th>
              <th className="pb-1 text-right font-semibold">n</th>
              <th className="pb-1 text-right font-semibold">Median</th>
            </tr>
          </thead>
          <tbody>
            {byStation.map((s) => (
              <tr key={s.name} className="border-t border-edge/60">
                <td className="py-[5px] pr-2 text-muted">{s.name}</td>
                <td className="py-[5px] text-right font-mono text-faint">{s.n}</td>
                <td className="py-[5px] text-right font-mono text-text">
                  RM{Math.round(s.median)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-panel px-2.5 py-2">
      <div className="label">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold leading-none">
        <span className="text-[10px] font-normal text-muted">RM</span>
        {Math.round(value).toLocaleString()}
      </div>
    </div>
  );
}
