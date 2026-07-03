"use client";

import { useState } from "react";
import type { Listing } from "@/lib/types";
import { ROOM_TYPE_LABELS, SOURCE_LABELS } from "@/lib/types";
import type { Commute } from "@/lib/railGraph";
import { RouteStrip } from "./RouteStrip";

export function DetailPanel({
  listing: l,
  commute,
  onClose,
  lineColors,
  lineNames,
}: {
  listing: Listing;
  commute: Commute | null;
  onClose: () => void;
  lineColors: Record<string, string>;
  lineNames: Record<string, string>;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const photos = l.photos.filter(Boolean);

  return (
    <div className="pointer-events-auto flex max-h-[calc(100%-24px)] w-[340px] flex-col overflow-hidden rounded-xl border border-edge bg-ink shadow-2xl">
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
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[14px] font-semibold leading-snug">{l.title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted hover:bg-panel hover:text-text"
          >
            ✕
          </button>
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

        <dl className="mt-3 space-y-1.5 text-[12px]">
          {l.propertyName && <Row k="Property" v={l.propertyName} />}
          {l.area && <Row k="Area" v={l.area} />}
          {l.address && <Row k="Address" v={l.address} />}
          {l.furnished && <Row k="Furnishing" v={l.furnished} />}
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
          <a href={`/admin?edit=${l.id}`} className="btn">
            Edit
          </a>
        </div>
      </div>
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
