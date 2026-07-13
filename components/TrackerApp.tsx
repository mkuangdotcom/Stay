"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Listing, Outreach, OutreachChannel, OutreachStatus, WalkCache } from "@/lib/types";
import {
  DEAD_REASON_PRESETS,
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

/* Optional columns — Listing and Actions are always shown. A hidden column's
   field is still editable in the row's expand panel (▸). */
type ColKey =
  | "photo"
  | "address"
  | "status"
  | "channel"
  | "contacted"
  | "viewing"
  | "rent"
  | "utilities"
  | "commute"
  | "notes";
const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "photo", label: "Photo" },
  { key: "address", label: "Address" },
  { key: "status", label: "Status" },
  { key: "channel", label: "Channel" },
  { key: "contacted", label: "Contacted" },
  { key: "viewing", label: "Viewing" },
  { key: "rent", label: "Rent RM" },
  { key: "utilities", label: "Utilities" },
  { key: "commute", label: "Commute" },
  { key: "notes", label: "Notes" },
];
const DEFAULT_COLS: Record<ColKey, boolean> = {
  photo: true,
  address: false,
  status: true,
  channel: false,
  contacted: false,
  viewing: true,
  rent: true,
  utilities: false,
  commute: true,
  notes: true,
};
const COLS_KEY = "stay:trackerCols";

export function TrackerApp({ graphData }: { graphData: RailGraphData }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [walkCache, setWalkCache] = useState<WalkCache>({});
  const [outreach, setOutreach] = useState<Record<string, Outreach>>({});
  const [loaded, setLoaded] = useState(false);
  const [office, setOffice] = useState(DEFAULT_OFFICE);
  const [busEnabled, setBusEnabled] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [showTemplate, setShowTemplate] = useState(false);
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [showCols, setShowCols] = useState(false);

  useEffect(() => {
    setOffice(readOffice());
    try {
      if (localStorage.getItem(BUS_KEY) === "off") setBusEnabled(false);
      setTemplate(localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE);
      const savedCols = localStorage.getItem(COLS_KEY);
      if (savedCols) setCols({ ...DEFAULT_COLS, ...JSON.parse(savedCols) });
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

  const toggleCol = (k: ColKey) => {
    setCols((c) => {
      const next = { ...c, [k]: !c[k] };
      try {
        localStorage.setItem(COLS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
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

  /* Listing + enabled optional columns + Actions */
  const colSpanAll = 2 + COLUMNS.filter((c) => cols[c.key]).length;

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

        {/* pipeline summary + column picker */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="chip cursor-default" data-on={counts[s] > 0}>
                {OUTREACH_STATUS_LABELS[s]}
                <span className="font-mono">{counts[s]}</span>
              </span>
            ))}
          </div>
          <div className="relative">
            <button
              className="btn py-1 text-[12px]"
              onClick={() => setShowCols((v) => !v)}
              title="Choose which columns to show — hidden fields stay editable via each row's ▸"
            >
              Columns ⚙
            </button>
            {showCols && (
              <div className="absolute right-0 z-20 mt-1 w-[170px] rounded-md border border-edge bg-panel p-1.5 shadow-lg">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11.5px] hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      className="accent-current"
                      checked={cols[c.key]}
                      onChange={() => toggleCol(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
                <p className="border-t border-edge/60 px-1.5 pb-0.5 pt-1.5 text-[10px] leading-snug text-faint">
                  Hidden fields stay editable in a row&rsquo;s ▸ panel.
                </p>
              </div>
            )}
          </div>
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
              <table className="w-full text-[12px]">
                <thead className="bg-panel">
                  <tr className="label text-left">
                    {cols.photo && <th className="px-2 py-2.5 font-semibold" />}
                    <th className="px-3 py-2.5 font-semibold">Listing</th>
                    {cols.address && <th className="px-2 py-2.5 font-semibold">Address</th>}
                    {cols.status && <th className="px-2 py-2.5 font-semibold">Status</th>}
                    {cols.channel && <th className="px-2 py-2.5 font-semibold">Channel</th>}
                    {cols.contacted && <th className="px-2 py-2.5 font-semibold">Contacted</th>}
                    {cols.viewing && <th className="px-2 py-2.5 font-semibold">Viewing</th>}
                    {cols.rent && <th className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">Rent RM</th>}
                    {cols.utilities && <th className="px-2 py-2.5 font-semibold">Utilities</th>}
                    {cols.commute && <th className="px-2 py-2.5 font-semibold">Commute</th>}
                    {cols.notes && <th className="px-2 py-2.5 font-semibold">Notes</th>}
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
                      cols={cols}
                      colSpanAll={colSpanAll}
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
  cols,
  colSpanAll,
  onSave,
  onPatchListing,
  onUntrack,
}: {
  o: Outreach;
  listing: Listing | null;
  autoMin: number | null;
  template: string;
  cols: Record<ColKey, boolean>;
  colSpanAll: number;
  onSave: (patch: Partial<Outreach>) => void;
  onPatchListing: (patch: Partial<Listing>) => void;
  onUntrack: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!l) {
    return (
      <tr className="border-t border-edge/60">
        <td className="px-3 py-2 text-faint" colSpan={colSpanAll - 1}>
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

  const photos = l.photos.filter(Boolean);
  const dead = o.status === "dead";
  /* fields whose columns are hidden — still editable in the expand panel */
  const hiddenFields = COLUMNS.filter((c) => c.key !== "photo" && !cols[c.key]);

  return (
    <>
      <tr className={`border-t border-edge/60 align-top ${dead ? "opacity-50" : ""}`}>
        {cols.photo && (
          <td className="w-[72px] px-2 py-2">
            {photos[0] ? (
              <button onClick={() => setExpanded((v) => !v)} title="Show all photos">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[0]}
                  alt=""
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="h-11 w-16 rounded-md object-cover"
                />
              </button>
            ) : (
              <span className="text-faint">—</span>
            )}
          </td>
        )}
        <td className="max-w-[260px] px-3 py-2">
          <div className="flex items-start gap-1.5">
            <button
              className="mt-px shrink-0 font-mono text-[11px] text-faint hover:text-accent"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Hide details" : "Photos & all details"}
              aria-label={expanded ? "Hide details" : "Show details"}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <div className="min-w-0">
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
              {dead && !cols.status && (
                <span className="mt-0.5 block truncate text-[11px] text-bad/80" title={o.deadReason ?? undefined}>
                  ✕ {o.deadReason || "no reason noted"}
                </span>
              )}
            </div>
          </div>
        </td>
        {cols.address && (
          <td className="px-2 py-2">
            <AddressCell listing={l} onPatch={onPatchListing} />
          </td>
        )}
        {cols.status && (
          <td className="px-2 py-2">
            <StatusCell o={o} onSave={onSave} />
          </td>
        )}
        {cols.channel && (
          <td className="px-2 py-2">
            <ChannelSelect o={o} onSave={onSave} />
          </td>
        )}
        {cols.contacted && (
          <td className="px-2 py-2">
            <ContactedInput o={o} onSave={onSave} />
          </td>
        )}
        {cols.viewing && (
          <td className="px-2 py-2">
            <ViewingInput o={o} onSave={onSave} />
          </td>
        )}
        {cols.rent && (
          <td className="px-2 py-2 text-right">
            <div className="font-mono">{l.priceRm.toLocaleString()}</div>
            <AgreedInput o={o} onSave={onSave} />
          </td>
        )}
        {cols.utilities && (
          <td className="px-2 py-2">
            <UtilitiesInput o={o} onSave={onSave} />
          </td>
        )}
        {cols.commute && (
          <td className="px-2 py-2">
            <CommuteInput o={o} autoMin={autoMin} onSave={onSave} />
          </td>
        )}
        {cols.notes && (
          <td className="px-2 py-2">
            <NotesInput o={o} onSave={onSave} />
          </td>
        )}
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

      {expanded && (
        <tr className={`border-t border-edge/30 bg-panel/40 ${dead ? "opacity-60" : ""}`}>
          <td colSpan={colSpanAll} className="px-4 pb-4 pt-2">
            {photos.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <a key={i} href={p} target="_blank" rel="noreferrer" className="shrink-0" title="Open full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="h-24 rounded-md object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-faint">No photos on this listing.</p>
            )}
            {hiddenFields.length > 0 && (
              <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
                {hiddenFields.map(({ key, label }) => (
                  <div key={key}>
                    <span className="label mb-1 block">{label}</span>
                    {key === "address" && <AddressCell listing={l} onPatch={onPatchListing} />}
                    {key === "status" && <StatusCell o={o} onSave={onSave} />}
                    {key === "channel" && <ChannelSelect o={o} onSave={onSave} />}
                    {key === "contacted" && <ContactedInput o={o} onSave={onSave} />}
                    {key === "viewing" && <ViewingInput o={o} onSave={onSave} />}
                    {key === "rent" && <AgreedInput o={o} onSave={onSave} />}
                    {key === "utilities" && <UtilitiesInput o={o} onSave={onSave} />}
                    {key === "commute" && <CommuteInput o={o} autoMin={autoMin} onSave={onSave} />}
                    {key === "notes" && <NotesInput o={o} onSave={onSave} wide />}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* --------------------------- field widgets --------------------------- */
/* Each renders in the table cell when its column is shown, or in the
   expand panel when hidden — never both, so uncontrolled inputs stay honest. */

function StatusCell({ o, onSave }: { o: Outreach; onSave: (patch: Partial<Outreach>) => void }) {
  const [asking, setAsking] = useState(false); // dead-reason prompt open
  const [reason, setReason] = useState("");

  const openPrompt = () => {
    setReason(o.deadReason ?? "");
    setAsking(true);
  };

  const change = (v: OutreachStatus) => {
    if (v === "dead") {
      openPrompt(); // capture the why before saving
    } else {
      setAsking(false);
      onSave({ status: v, deadReason: null });
    }
  };

  const commit = (r: string) => {
    onSave({ status: "dead", deadReason: r.trim() || null });
    setAsking(false);
  };

  return (
    <div className="w-[150px] min-w-[130px]">
      <select
        className="field w-auto py-1 text-[11.5px]"
        value={asking ? "dead" : o.status}
        aria-label="Status"
        onChange={(e) => change(e.target.value as OutreachStatus)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {OUTREACH_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {asking && (
        <div className="mt-1.5 w-[190px] rounded-md border border-edge bg-panel p-2">
          <p className="text-[10.5px] font-semibold text-muted">Why is it dead?</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DEAD_REASON_PRESETS.map((p) => (
              <button key={p} className="chip" onClick={() => commit(p)}>
                {p}
              </button>
            ))}
          </div>
          <input
            className="field mt-1.5 w-full py-1 text-[11px]"
            placeholder="or type a reason…"
            value={reason}
            aria-label="Dead reason"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit(reason)}
          />
          <div className="mt-1.5 flex justify-end gap-3">
            <button className="text-[10.5px] text-muted hover:underline" onClick={() => setAsking(false)}>
              cancel
            </button>
            <button className="text-[10.5px] text-bad hover:underline" onClick={() => commit(reason)}>
              mark dead
            </button>
          </div>
        </div>
      )}
      {!asking && o.status === "dead" && (
        <button
          className="mt-1 block max-w-[150px] truncate text-left text-[10.5px] text-bad/80 hover:underline"
          onClick={openPrompt}
          title={o.deadReason ? `✕ ${o.deadReason} — click to edit` : "Note why this one died"}
        >
          ✕ {o.deadReason || "add reason…"}
        </button>
      )}
    </div>
  );
}

function ChannelSelect({ o, onSave }: { o: Outreach; onSave: (patch: Partial<Outreach>) => void }) {
  return (
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
  );
}

function ContactedInput({ o, onSave }: { o: Outreach; onSave: (patch: Partial<Outreach>) => void }) {
  return (
    <input
      type="date"
      className="field w-[130px] min-w-[130px] py-1 font-mono text-[11px]"
      value={o.contactedAt?.slice(0, 10) ?? ""}
      aria-label="Date contacted"
      onChange={(e) => onSave({ contactedAt: e.target.value || null })}
    />
  );
}

function ViewingInput({ o, onSave }: { o: Outreach; onSave: (patch: Partial<Outreach>) => void }) {
  return (
    <input
      type="datetime-local"
      className="field w-[170px] min-w-[170px] py-1 font-mono text-[11px]"
      value={o.viewingAt?.slice(0, 16) ?? ""}
      aria-label="Viewing appointment"
      onChange={(e) => onSave({ viewingAt: e.target.value || null })}
    />
  );
}

function AgreedInput({ o, onSave }: { o: Outreach; onSave: (patch: Partial<Outreach>) => void }) {
  return (
    <input
      type="number"
      className="field mt-1 w-[80px] min-w-[80px] py-1 text-right font-mono text-[11px]"
      placeholder="agreed"
      defaultValue={o.agreedRm ?? ""}
      aria-label="Agreed rent"
      onBlur={(e) => onSave({ agreedRm: e.target.value ? Number(e.target.value) : null })}
    />
  );
}

function UtilitiesInput({ o, onSave }: { o: Outreach; onSave: (patch: Partial<Outreach>) => void }) {
  return (
    <input
      className="field w-[150px] min-w-[150px] py-1 text-[11.5px]"
      placeholder="wifi+water incl…"
      defaultValue={o.utilities ?? ""}
      aria-label="Utilities"
      onBlur={(e) => onSave({ utilities: e.target.value.trim() || null })}
    />
  );
}

function CommuteInput({
  o,
  autoMin,
  onSave,
}: {
  o: Outreach;
  autoMin: number | null;
  onSave: (patch: Partial<Outreach>) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        className="field w-[62px] min-w-[62px] py-1 text-right font-mono text-[11px]"
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
  );
}

function NotesInput({
  o,
  onSave,
  wide = false,
}: {
  o: Outreach;
  onSave: (patch: Partial<Outreach>) => void;
  wide?: boolean;
}) {
  return (
    <textarea
      rows={2}
      className={`field py-1 text-[11.5px] ${wide ? "w-[320px] min-w-[320px]" : "w-[190px] min-w-[190px]"}`}
      placeholder="deposit, who replied…"
      defaultValue={o.notes}
      aria-label="Notes"
      onBlur={(e) => onSave({ notes: e.target.value })}
    />
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
    <div className="w-[210px] min-w-[210px]">
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
      {l.photos[0] && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={l.photos[0]}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-10 w-14 shrink-0 rounded-md object-cover"
        />
      )}
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
