"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Listing, Outreach, OutreachChannel, OutreachStatus, WalkCache } from "@/lib/types";
import {
  emptyOutreach,
  OUTREACH_CHANNEL_LABELS,
  OUTREACH_STATUS_LABELS,
  ROOM_TYPE_LABELS,
  SOURCE_LABELS,
} from "@/lib/types";
import { RailGraph, stripBus, type RailGraphData } from "@/lib/railGraph";
import { BUS_KEY, DEFAULT_OFFICE, readOffice } from "@/lib/office";
import {
  DEFAULT_TEMPLATE,
  TEMPLATE_KEY,
  fillTemplate,
  formatPhone,
  waLink,
} from "@/lib/contact";

const STATUSES = Object.keys(OUTREACH_STATUS_LABELS) as OutreachStatus[];
const CHANNELS = Object.keys(OUTREACH_CHANNEL_LABELS) as OutreachChannel[];
/* most actionable first: appointments, replies to answer, waiting, done, dead */
const STATUS_ORDER: OutreachStatus[] = ["viewing", "replied", "contacted", "contract", "dead"];

const today = () => new Date().toISOString().slice(0, 10);

export function TrackerApp({ graphData }: { graphData: RailGraphData }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [walkCache, setWalkCache] = useState<WalkCache>({});
  const [outreach, setOutreach] = useState<Record<string, Outreach>>({});
  const [loaded, setLoaded] = useState(false);
  const [office, setOffice] = useState(DEFAULT_OFFICE);
  const [busEnabled, setBusEnabled] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [showTemplate, setShowTemplate] = useState(false);

  useEffect(() => {
    setOffice(readOffice());
    try {
      if (localStorage.getItem(BUS_KEY) === "off") setBusEnabled(false);
      setTemplate(localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE);
    } catch {}
    Promise.all([
      fetch("/api/listings").then((r) => r.json()),
      fetch("/api/outreach").then((r) => r.json()),
    ])
      .then(([ld, od]) => {
        setListings(ld.listings ?? []);
        setWalkCache(ld.walkCache ?? {});
        setOutreach(
          Object.fromEntries(((od.outreach ?? []) as Outreach[]).map((o) => [o.listingId, o]))
        );
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const saveTemplate = (t: string) => {
    setTemplate(t);
    try {
      localStorage.setItem(TEMPLATE_KEY, t);
    } catch {}
  };

  const save = (listingId: string, patch: Partial<Outreach>) => {
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

  /** Update listing fields (e.g. the real address from the owner) — the map reads the same row. */
  const patchListing = (id: string, patch: Partial<Listing>) => {
    setListings((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    // moved pin → cached walk times no longer apply; recompute from the new coords
    if (patch.lat !== undefined || patch.lng !== undefined) {
      setWalkCache((c) => {
        const rest = { ...c };
        delete rest[id];
        return rest;
      });
    }
    fetch(`/api/listings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
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

  /* auto commute, same engine as the map */
  const graph = useMemo(
    () => new RailGraph(busEnabled ? graphData : stripBus(graphData)),
    [graphData, busEnabled]
  );
  const routing = useMemo(() => graph.routeToOffice(office), [graph, office]);
  const byId = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings]);

  const autoCommute = (l: Listing): number | null => {
    const c = graph.commuteFrom(l.lat, l.lng, routing, walkCache[l.id]);
    return c ? Math.round(c.totalMin) : null;
  };

  const tracked = useMemo(() => {
    return Object.values(outreach).sort((a, b) => {
      const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      return s !== 0 ? s : a.updatedAt < b.updatedAt ? 1 : -1;
    });
  }, [outreach]);

  const queue = useMemo(
    () => listings.filter((l) => l.isFav && !outreach[l.id] && l.isActive),
    [listings, outreach]
  );

  const counts = useMemo(() => {
    const c = {} as Record<OutreachStatus, number>;
    for (const s of STATUSES) c[s] = 0;
    for (const o of tracked) c[o.status]++;
    return c;
  }, [tracked]);

  return (
    <div className="h-dvh overflow-y-auto bg-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-ink/95 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-bold tracking-[0.14em]">
            STAY<span className="text-accent">.</span>
          </h1>
          <span className="label">Outreach tracker</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setShowTemplate((v) => !v)}>
            {showTemplate ? "Hide template" : "Message template"}
          </button>
          <Link href="/" className="btn">
            ← Back to map
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] p-5">
        {showTemplate && (
          <section className="mb-6 rounded-xl border border-edge bg-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Pre-written message</h2>
              {template !== DEFAULT_TEMPLATE && (
                <button
                  className="text-[11px] text-accent hover:underline"
                  onClick={() => saveTemplate(DEFAULT_TEMPLATE)}
                >
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              rows={4}
              className="field mt-2 font-mono text-[12px]"
              value={template}
              onChange={(e) => saveTemplate(e.target.value)}
              aria-label="Message template"
            />
            <p className="mt-1.5 text-[11px] text-faint">
              Placeholders: <code className="text-muted">{"{name} {title} {price} {area} {url}"}</code>.
              Saved on this device.
            </p>
          </section>
        )}

        {/* pipeline summary */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="chip cursor-default" data-on={counts[s] > 0}>
              {OUTREACH_STATUS_LABELS[s]}
              <span className="font-mono">{counts[s]}</span>
            </span>
          ))}
        </div>

        {/* tracked listings */}
        <section className="mt-4">
          {tracked.length === 0 && (
            <p className="rounded-xl border border-edge bg-panel p-6 text-center text-[12.5px] text-muted">
              {loaded
                ? "Nothing tracked yet — use the WhatsApp button or status chips on a listing."
                : "Loading…"}
            </p>
          )}
          {tracked.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-edge">
              <table className="w-full min-w-[1460px] text-[12px]">
                <thead className="bg-panel">
                  <tr className="label text-left">
                    <th className="px-3 py-2.5 font-semibold">Listing</th>
                    <th className="px-2 py-2.5 font-semibold">Address</th>
                    <th className="px-2 py-2.5 font-semibold">Status</th>
                    <th className="px-2 py-2.5 font-semibold">Channel</th>
                    <th className="px-2 py-2.5 font-semibold">Contacted</th>
                    <th className="px-2 py-2.5 font-semibold">Viewing</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Rent RM</th>
                    <th className="px-2 py-2.5 font-semibold">Utilities</th>
                    <th className="px-2 py-2.5 font-semibold">Commute</th>
                    <th className="px-2 py-2.5 font-semibold">Notes</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tracked.map((o) => (
                    <TrackedRow
                      key={o.listingId}
                      o={o}
                      listing={byId.get(o.listingId) ?? null}
                      autoMin={
                        byId.has(o.listingId) ? autoCommute(byId.get(o.listingId)!) : null
                      }
                      template={template}
                      onSave={(patch) => save(o.listingId, patch)}
                      onPatchListing={(patch) => patchListing(o.listingId, patch)}
                      onUntrack={() => untrack(o.listingId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* starred but not yet contacted */}
        {queue.length > 0 && (
          <section className="mt-8 pb-10">
            <h2 className="text-[13px] font-semibold">
              Starred, not contacted yet <span className="text-faint">({queue.length})</span>
            </h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-edge">
              {queue.map((l) => (
                <QueueRow
                  key={l.id}
                  listing={l}
                  autoMin={autoCommute(l)}
                  template={template}
                  onContacted={(channel) =>
                    save(l.id, { status: "contacted", channel, contactedAt: today() })
                  }
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ------------------------------ rows ------------------------------ */

function TrackedRow({
  o,
  listing: l,
  autoMin,
  template,
  onSave,
  onPatchListing,
  onUntrack,
}: {
  o: Outreach;
  listing: Listing | null;
  autoMin: number | null;
  template: string;
  onSave: (patch: Partial<Outreach>) => void;
  onPatchListing: (patch: Partial<Listing>) => void;
  onUntrack: () => void;
}) {
  if (!l) {
    return (
      <tr className="border-t border-edge/60">
        <td className="px-3 py-2 text-faint" colSpan={10}>
          Listing removed from the database
        </td>
        <td className="px-3 py-2 text-right">
          <button className="text-bad hover:underline" onClick={onUntrack}>
            untrack
          </button>
        </td>
      </tr>
    );
  }
  return (
    <tr className={`border-t border-edge/60 align-top ${o.status === "dead" ? "opacity-50" : ""}`}>
      <td className="max-w-[260px] px-3 py-2">
        {l.url ? (
          <a href={l.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
            {l.propertyName || l.title}
          </a>
        ) : (
          <span className="block truncate font-medium">{l.propertyName || l.title}</span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-faint">
          {ROOM_TYPE_LABELS[l.roomType]} · {l.area ?? SOURCE_LABELS[l.source]}
          {l.contactName && ` · ${l.contactName}`}
          {l.phone && ` · ${formatPhone(l.phone)}`}
          {!l.isActive && <span className="text-bad"> · gone</span>}
        </span>
      </td>
      <td className="px-2 py-2">
        <AddressCell listing={l} onPatch={onPatchListing} />
      </td>
      <td className="px-2 py-2">
        <select
          className="field w-auto py-1 text-[11.5px]"
          value={o.status}
          aria-label="Status"
          onChange={(e) => onSave({ status: e.target.value as OutreachStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {OUTREACH_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <select
          className="field w-auto py-1 text-[11.5px]"
          value={o.channel ?? ""}
          aria-label="Channel"
          onChange={(e) => onSave({ channel: (e.target.value || null) as Outreach["channel"] })}
        >
          <option value="">—</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {OUTREACH_CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <input
          type="date"
          className="field w-[130px] py-1 font-mono text-[11px]"
          value={o.contactedAt?.slice(0, 10) ?? ""}
          aria-label="Date contacted"
          onChange={(e) => onSave({ contactedAt: e.target.value || null })}
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="datetime-local"
          className="field w-[170px] py-1 font-mono text-[11px]"
          value={o.viewingAt?.slice(0, 16) ?? ""}
          aria-label="Viewing appointment"
          onChange={(e) => onSave({ viewingAt: e.target.value || null })}
        />
      </td>
      <td className="px-2 py-2 text-right">
        <div className="font-mono">{l.priceRm.toLocaleString()}</div>
        <input
          type="number"
          className="field mt-1 w-[80px] py-1 text-right font-mono text-[11px]"
          placeholder="agreed"
          defaultValue={o.agreedRm ?? ""}
          aria-label="Agreed rent"
          onBlur={(e) => onSave({ agreedRm: e.target.value ? Number(e.target.value) : null })}
        />
      </td>
      <td className="px-2 py-2">
        <input
          className="field w-[150px] py-1 text-[11.5px]"
          placeholder="wifi+water incl…"
          defaultValue={o.utilities ?? ""}
          aria-label="Utilities"
          onBlur={(e) => onSave({ utilities: e.target.value.trim() || null })}
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            className="field w-[62px] py-1 text-right font-mono text-[11px]"
            placeholder={autoMin !== null ? String(autoMin) : "—"}
            defaultValue={o.commuteMinOverride ?? ""}
            aria-label="Commute minutes (blank = auto)"
            title="Auto-computed door-to-door; type to override, clear to go back to auto"
            onBlur={(e) =>
              onSave({ commuteMinOverride: e.target.value ? Number(e.target.value) : null })
            }
          />
          <span className="text-[10.5px] text-faint">
            min{o.commuteMinOverride === null && autoMin !== null ? " (auto)" : ""}
          </span>
        </div>
      </td>
      <td className="px-2 py-2">
        <textarea
          rows={2}
          className="field w-[190px] py-1 text-[11.5px]"
          placeholder="deposit, who replied…"
          defaultValue={o.notes}
          aria-label="Notes"
          onBlur={(e) => onSave({ notes: e.target.value })}
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {l.phone && (
          <a
            href={waLink(l.phone, fillTemplate(template, l))}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            WhatsApp ↗
          </a>
        )}
        <button className="ml-3 text-muted hover:underline" onClick={onUntrack}>
          untrack
        </button>
      </td>
    </tr>
  );
}

/**
 * Address the owner gave you: text saves onto the listing; “locate” geocodes it
 * so the map pin moves to the real spot (walk cache resets, commute recomputes).
 */
function AddressCell({
  listing: l,
  onPatch,
}: {
  listing: Listing;
  onPatch: (patch: Partial<Listing>) => void;
}) {
  const [value, setValue] = useState(l.address ?? "");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [located, setLocated] = useState(false);

  const saveText = () => {
    const v = value.trim();
    if (v !== (l.address ?? "")) onPatch({ address: v || null });
  };

  const locate = async () => {
    const q = value.trim();
    if (!q) return;
    setBusy(true);
    setResults(null);
    try {
      const d = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults(d.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const pick = (r: { name: string; lat: number; lng: number }) => {
    onPatch({ address: value.trim(), lat: r.lat, lng: r.lng });
    setResults(null);
    setLocated(true);
    setTimeout(() => setLocated(false), 2500);
  };

  return (
    <div className="w-[210px]">
      <textarea
        rows={2}
        className="field w-full py-1 text-[11.5px]"
        placeholder="address from the owner…"
        value={value}
        aria-label="Address"
        onChange={(e) => setValue(e.target.value)}
        onBlur={saveText}
      />
      <div className="mt-0.5 flex items-center gap-2">
        <button
          className="text-[10.5px] text-accent hover:underline disabled:opacity-40"
          onClick={locate}
          disabled={busy || !value.trim()}
          title="Geocode this address and move the map pin"
        >
          {busy ? "locating…" : "📍 locate on map"}
        </button>
        {located && <span className="text-[10.5px] text-good">pin moved ✓</span>}
      </div>
      {results !== null && !located && (
        <div className="mt-1 max-h-[110px] overflow-y-auto rounded-md border border-edge bg-panel">
          {results.length === 0 && (
            <p className="px-2 py-1.5 text-[10.5px] text-faint">No match — try adding the area or city.</p>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              className="block w-full px-2 py-1.5 text-left text-[10.5px] leading-snug hover:bg-white/5"
              onClick={() => pick(r)}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  listing: l,
  autoMin,
  template,
  onContacted,
}: {
  listing: Listing;
  autoMin: number | null;
  template: string;
  onContacted: (channel: Outreach["channel"]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(fillTemplate(template, l));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge/60 bg-ink px-3 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        {l.url ? (
          <a href={l.url} target="_blank" rel="noreferrer" className="block truncate text-[12.5px] font-medium hover:underline">
            {l.propertyName || l.title}
          </a>
        ) : (
          <span className="block truncate text-[12.5px] font-medium">{l.propertyName || l.title}</span>
        )}
        <span className="block truncate text-[11px] text-faint">
          RM{l.priceRm.toLocaleString()} · {ROOM_TYPE_LABELS[l.roomType]} ·{" "}
          {l.area ?? SOURCE_LABELS[l.source]}
          {autoMin !== null && ` · ${autoMin} min door-to-door`}
          {l.contactName && ` · ${l.contactName}`}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {l.phone ? (
          <a
            href={waLink(l.phone, fillTemplate(template, l))}
            target="_blank"
            rel="noreferrer"
            className="btn btn-accent py-1 text-[12px]"
            onClick={() => onContacted("whatsapp")}
          >
            WhatsApp ↗
          </a>
        ) : (
          <button className="btn py-1 text-[12px]" onClick={copyMessage}>
            {copied ? "Copied ✓" : "Copy message"}
          </button>
        )}
        <button
          className="btn py-1 text-[12px]"
          onClick={() => onContacted(l.phone ? "whatsapp" : "portal")}
          title="Move into the tracker as contacted"
        >
          Mark contacted
        </button>
      </div>
    </div>
  );
}
