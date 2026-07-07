"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { Listing, RoomType, Source } from "@/lib/types";
import { ROOM_TYPE_LABELS, SOURCE_LABELS } from "@/lib/types";

export default function AdminPage() {
  return (
    <Suspense>
      <Admin />
    </Suspense>
  );
}

interface FormState {
  id: string | null;
  url: string;
  title: string;
  priceRm: string;
  roomType: RoomType;
  source: Source;
  propertyName: string;
  area: string;
  furnished: string;
  gender: string;
  minTermMonths: string;
  photos: string;
  notes: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY: FormState = {
  id: null,
  url: "",
  title: "",
  priceRm: "",
  roomType: "unknown",
  source: "manual",
  propertyName: "",
  area: "",
  furnished: "",
  gender: "",
  minTermMonths: "",
  photos: "",
  notes: "",
  lat: null,
  lng: null,
};

function Admin() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const params = useSearchParams();
  const [tab, setTab] = useState<"listings" | "users">(
    params.get("tab") === "users" ? "users" : "listings"
  );

  const load = () =>
    fetch("/api/listings")
      .then((r) => r.json())
      .then((d) => setListings(d.listings ?? []));

  useEffect(() => {
    load();
  }, []);

  // deep link: /admin?edit=<id>
  useEffect(() => {
    const id = params.get("edit");
    if (id && listings.length) {
      const l = listings.find((x) => x.id === id);
      if (l) startEdit(l);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, listings.length]);

  function startEdit(l: Listing) {
    setTab("listings");
    setForm({
      id: l.id,
      url: l.url ?? "",
      title: l.title,
      priceRm: String(l.priceRm),
      roomType: l.roomType,
      source: l.source,
      propertyName: l.propertyName ?? "",
      area: l.area ?? "",
      furnished: l.furnished ?? "",
      gender: l.gender ?? "",
      minTermMonths: l.minTermMonths !== null ? String(l.minTermMonths) : "",
      photos: l.photos.join("\n"),
      notes: l.notes ?? "",
      lat: l.lat,
      lng: l.lng,
    });
    window.scrollTo({ top: 0 });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.lat === null || form.lng === null) {
      setStatus("Drop a pin on the map first — search a place or click the map.");
      return;
    }
    const body = {
      url: form.url || null,
      title: form.title,
      priceRm: Number(form.priceRm),
      roomType: form.roomType,
      source: form.source,
      propertyName: form.propertyName || null,
      area: form.area || null,
      furnished: form.furnished || null,
      gender: form.gender || null,
      minTermMonths: form.minTermMonths ? Number(form.minTermMonths) : null,
      photos: form.photos.split("\n").map((s) => s.trim()).filter(Boolean),
      notes: form.notes || null,
      lat: form.lat,
      lng: form.lng,
    };
    const res = form.id
      ? await fetch(`/api/listings/${form.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
    if (res.ok) {
      setStatus(form.id ? "Saved." : "Added — it's on the map now.");
      setForm(EMPTY);
      load();
    } else {
      setStatus((await res.json()).error ?? "Something went wrong saving.");
    }
  }

  async function toggleActive(l: Listing) {
    await fetch(`/api/listings/${l.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !l.isActive }),
    });
    load();
  }

  async function remove(l: Listing) {
    if (!confirm(`Delete "${l.title.slice(0, 60)}"? This cannot be undone.`)) return;
    await fetch(`/api/listings/${l.id}`, { method: "DELETE" });
    load();
  }

  const shown = listings.filter((l) => {
    const q = tableFilter.toLowerCase();
    return !q || `${l.title} ${l.source} ${l.area ?? ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="h-dvh overflow-y-auto bg-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-ink/95 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <h1 className="text-[15px] font-bold tracking-[0.14em]">
            STAY<span className="text-accent">.</span>
          </h1>
          <nav className="flex gap-1">
            <button
              className="chip"
              data-on={tab === "listings"}
              onClick={() => setTab("listings")}
            >
              Listings
            </button>
            <button className="chip" data-on={tab === "users"} onClick={() => setTab("users")}>
              Users
            </button>
          </nav>
        </div>
        <Link href="/" className="btn">
          ← Back to map
        </Link>
      </header>

      {tab === "users" && <GuestAccess />}

      <main
        className={`mx-auto grid max-w-[1100px] gap-6 p-5 lg:grid-cols-[1fr_1fr] ${
          tab === "listings" ? "" : "hidden"
        }`}
      >
        {/* form */}
        <form onSubmit={save} className="space-y-3">
          <h2 className="text-[14px] font-semibold">
            {form.id ? "Edit listing" : "Add a listing"}
          </h2>
          <p className="text-[12px] text-faint">
            Paste anything — a Facebook Marketplace find, a WhatsApp tip, a signboard. Search or
            click the map to place it.
          </p>

          <div>
            <label className="label" htmlFor="f-url">Original link</label>
            <input
              id="f-url"
              className="field mt-1"
              placeholder="https://facebook.com/marketplace/item/…"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="f-title">Title *</label>
            <input
              id="f-title"
              required
              className="field mt-1"
              placeholder="Master room at Casa Utama, near MRT"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label" htmlFor="f-price">Rent RM / mo *</label>
              <input
                id="f-price"
                required
                type="number"
                min={1}
                className="field mt-1 font-mono"
                value={form.priceRm}
                onChange={(e) => setForm({ ...form, priceRm: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="f-type">Type</label>
              <select
                id="f-type"
                className="field mt-1"
                value={form.roomType}
                onChange={(e) => setForm({ ...form, roomType: e.target.value as RoomType })}
              >
                {Object.entries(ROOM_TYPE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-source">Source</label>
              <select
                id="f-source"
                className="field mt-1"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as Source })}
                disabled={!!form.id}
              >
                {Object.entries(SOURCE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="f-gender">Tenant restriction</label>
              <select
                id="f-gender"
                className="field mt-1"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="">Anyone</option>
                <option value="female">Female only</option>
                <option value="male">Male only</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-term">Min stay</label>
              <select
                id="f-term"
                className="field mt-1"
                value={form.minTermMonths}
                onChange={(e) => setForm({ ...form, minTermMonths: e.target.value })}
              >
                <option value="">Not stated</option>
                <option value="1">Short-term OK</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="f-prop">Property / condo</label>
              <input
                id="f-prop"
                className="field mt-1"
                value={form.propertyName}
                onChange={(e) => setForm({ ...form, propertyName: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="f-area">Area</label>
              <input
                id="f-area"
                className="field mt-1"
                placeholder="Bandar Utama"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="f-furn">Furnishing</label>
            <select
              id="f-furn"
              className="field mt-1"
              value={form.furnished}
              onChange={(e) => setForm({ ...form, furnished: e.target.value })}
            >
              <option value="">Not stated</option>
              <option>Fully furnished</option>
              <option>Partially furnished</option>
              <option>Unfurnished</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="f-photos">Photo URLs (one per line)</label>
            <textarea
              id="f-photos"
              rows={2}
              className="field mt-1 font-mono text-[11px]"
              value={form.photos}
              onChange={(e) => setForm({ ...form, photos: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="f-notes">Notes</label>
            <textarea
              id="f-notes"
              rows={2}
              className="field mt-1"
              placeholder="Viewing on Saturday, agent Sarah 012-…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" className="btn btn-accent">
              {form.id ? "Save changes" : "Add listing"}
            </button>
            {form.id && (
              <button type="button" className="btn" onClick={() => setForm(EMPTY)}>
                Cancel edit
              </button>
            )}
            {status && <span className="text-[12px] text-muted">{status}</span>}
          </div>
        </form>

        {/* pin map */}
        <div>
          <PinMap
            lat={form.lat}
            lng={form.lng}
            onPin={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
          />
          <p className="mt-2 text-[11px] text-faint">
            {form.lat !== null
              ? `Pinned at ${form.lat.toFixed(5)}, ${form.lng!.toFixed(5)} — drag to adjust.`
              : "Search a condo or address, or click the map to drop the pin."}
          </p>
        </div>
      </main>

      {/* table */}
      <section className={`mx-auto max-w-[1100px] px-5 pb-10 ${tab === "listings" ? "" : "hidden"}`}>
        <div className="flex items-center justify-between border-b border-edge pb-2">
          <h2 className="text-[14px] font-semibold">All listings ({listings.length})</h2>
          <input
            type="search"
            className="field w-[220px]"
            placeholder="Filter…"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          />
        </div>
        <table className="mt-1 w-full text-[12px]">
          <thead>
            <tr className="label text-left">
              <th className="py-2 font-semibold">Listing</th>
              <th className="py-2 text-right font-semibold">RM</th>
              <th className="py-2 pl-4 font-semibold">Source</th>
              <th className="py-2 pl-4 font-semibold">Seen</th>
              <th className="py-2 pl-4 font-semibold">Status</th>
              <th className="py-2 pl-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="border-t border-edge/60">
                <td className="max-w-[380px] truncate py-2 pr-3">
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {l.title}
                    </a>
                  ) : (
                    l.title
                  )}
                </td>
                <td className="py-2 text-right font-mono">{l.priceRm.toLocaleString()}</td>
                <td className="py-2 pl-4 text-muted">{SOURCE_LABELS[l.source]}</td>
                <td className="py-2 pl-4 font-mono text-[11px] text-faint">
                  {new Date(l.lastSeen).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}
                </td>
                <td className="py-2 pl-4">
                  {l.isActive ? (
                    <span className="text-good">active</span>
                  ) : (
                    <span className="text-faint">gone</span>
                  )}
                </td>
                <td className="py-2 pl-4 text-right whitespace-nowrap">
                  <button className="text-accent hover:underline" onClick={() => startEdit(l)}>
                    Edit
                  </button>
                  <button className="ml-3 text-muted hover:underline" onClick={() => toggleActive(l)}>
                    {l.isActive ? "Mark gone" : "Restore"}
                  </button>
                  <button className="ml-3 text-bad hover:underline" onClick={() => remove(l)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ----------------------- guest access ----------------------- */

/** Owner hands out revocable username+password pairs (read-only site access). */
function GuestAccess() {
  const [users, setUsers] = useState<{ username: string; createdAt: string }[]>([]);
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: name, password: pw }),
    });
    if (res.ok) {
      setMsg(`Created "${name.toLowerCase().trim()}" — share the username + password.`);
      setName("");
      setPw("");
      load();
    } else {
      setMsg((await res.json()).error ?? "Failed");
    }
  }

  async function revoke(username: string) {
    if (!confirm(`Delete "${username}"? Their access stops within a minute.`)) return;
    await fetch(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    load();
  }

  async function resetPassword(username: string) {
    const pw = prompt(`New password for "${username}" (min 8 characters):`);
    if (pw === null) return;
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setMsg(res.ok ? `Password updated for "${username}".` : (await res.json()).error ?? "Failed");
  }

  return (
    <section id="guests" className="mx-auto max-w-[1100px] scroll-mt-16 px-5 py-5">
      <h2 className="text-[14px] font-semibold">Users ({users.length})</h2>
      <p className="mt-1 text-[12px] text-faint">
        Accounts can browse everything, read-only. No admin access.
      </p>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="field w-[180px]"
          placeholder="username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New guest username"
        />
        <input
          className="field w-[200px]"
          type="text"
          placeholder="password (min 8 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          aria-label="New guest password"
        />
        <button className="btn btn-accent" disabled={!name.trim() || pw.length < 8}>
          Add user
        </button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </form>
      {users.length > 0 && (
        <table className="mt-3 w-full max-w-[560px] text-[12px]">
          <tbody>
            {users.map((u) => (
              <tr key={u.username} className="border-t border-edge/60">
                <td className="py-2 font-mono">{u.username}</td>
                <td className="py-2 text-faint">
                  since {new Date(u.createdAt).toLocaleDateString("en-MY")}
                </td>
                <td className="py-2 text-right">
                  <button
                    className="text-muted hover:underline"
                    onClick={() => resetPassword(u.username)}
                  >
                    Reset password
                  </button>
                  <button
                    className="ml-4 text-bad hover:underline"
                    onClick={() => revoke(u.username)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ------------------------- mini pin map ------------------------- */

function PinMap({
  lat,
  lng,
  onPin,
}: {
  lat: number | null;
  lng: number | null;
  onPin: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [101.663, 3.128],
      zoom: 10.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("click", (e) => {
      placeMarker(e.lngLat.lat, e.lngLat.lng);
      onPinRef.current(e.lngLat.lat, e.lngLat.lng);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(la: number, ln: number) {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#ffcd00", draggable: true })
        .setLngLat([ln, la])
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLngLat();
        onPinRef.current(p.lat, p.lng);
      });
    } else {
      markerRef.current.setLngLat([ln, la]);
    }
  }

  // reflect external form state (e.g. edit mode)
  useEffect(() => {
    if (lat !== null && lng !== null) {
      placeMarker(lat, lng);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 14) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data.results ?? []);
  }

  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input
          className="field"
          placeholder="Search a condo, street or area…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search location"
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {results.length > 0 && (
        <ul className="mt-1 max-h-[120px] overflow-y-auto rounded-lg border border-edge bg-panel text-[12px]">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full truncate px-3 py-1.5 text-left hover:bg-panel-2"
                onClick={() => {
                  onPin(r.lat, r.lng);
                  setResults([]);
                }}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="mt-2 h-[320px] w-full overflow-hidden rounded-xl border border-edge" />
    </div>
  );
}
