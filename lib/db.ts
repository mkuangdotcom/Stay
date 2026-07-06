/**
 * Storage layer. Two backends behind one interface:
 *  - "supabase": when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (production / Vercel)
 *  - "file":     local JSON under .data/ (development, or fully-local usage)
 * Server-side only — never import from client components.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Listing, PricePoint, WalkCache, WalkEntry } from "./types";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Db {
  listListings(): Promise<Listing[]>;
  /** Insert-or-update by (source, sourceId); returns ids of rows whose price changed or that are new. */
  upsertListings(rows: Listing[]): Promise<{ created: number; updated: number }>;
  createListing(row: Listing): Promise<void>;
  updateListing(id: string, patch: Partial<Listing>): Promise<void>;
  deleteListing(id: string): Promise<void>;
  /** Mark listings of a source not seen since `cutoffIso` as inactive. */
  deactivateStale(source: string, cutoffIso: string): Promise<number>;
  getWalkCache(): Promise<WalkCache>;
  setWalkEntries(listingId: string, entries: WalkEntry[]): Promise<void>;
  addPricePoints(points: PricePoint[]): Promise<void>;
  listPriceHistory(): Promise<PricePoint[]>;
}

/* ---------------------------- file backend ---------------------------- */

const DATA_DIR = join(process.cwd(), ".data");
const f = (name: string) => join(DATA_DIR, name);

function readJson<T>(name: string, fallback: T): T {
  if (!existsSync(f(name))) return fallback;
  return JSON.parse(readFileSync(f(name), "utf8")) as T;
}

function writeJson(name: string, value: unknown) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(f(name), JSON.stringify(value, null, 1));
}

const fileDb: Db = {
  async listListings() {
    return readJson<Listing[]>("listings.json", []);
  },

  async upsertListings(rows) {
    const all = readJson<Listing[]>("listings.json", []);
    const byKey = new Map(all.map((l) => [`${l.source}|${l.sourceId}`, l]));
    const pricePoints: PricePoint[] = [];
    let created = 0,
      updated = 0;
    for (const row of rows) {
      const key = `${row.source}|${row.sourceId}`;
      const existing = byKey.get(key);
      if (existing) {
        if (existing.priceRm !== row.priceRm) {
          pricePoints.push({ listingId: existing.id, priceRm: row.priceRm, seenAt: row.lastSeen });
        }
        Object.assign(existing, row, { id: existing.id, firstSeen: existing.firstSeen });
        updated++;
      } else {
        byKey.set(key, row);
        pricePoints.push({ listingId: row.id, priceRm: row.priceRm, seenAt: row.firstSeen });
        created++;
      }
    }
    writeJson("listings.json", [...byKey.values()]);
    if (pricePoints.length) await fileDb.addPricePoints(pricePoints);
    return { created, updated };
  },

  async createListing(row) {
    const all = readJson<Listing[]>("listings.json", []);
    all.push(row);
    writeJson("listings.json", all);
  },

  async updateListing(id, patch) {
    const all = readJson<Listing[]>("listings.json", []);
    const idx = all.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error(`listing ${id} not found`);
    all[idx] = { ...all[idx], ...patch, id };
    writeJson("listings.json", all);
  },

  async deleteListing(id) {
    const all = readJson<Listing[]>("listings.json", []);
    writeJson("listings.json", all.filter((l) => l.id !== id));
  },

  async deactivateStale(source, cutoffIso) {
    const all = readJson<Listing[]>("listings.json", []);
    let n = 0;
    for (const l of all) {
      if (l.source === source && l.isActive && l.lastSeen < cutoffIso) {
        l.isActive = false;
        n++;
      }
    }
    writeJson("listings.json", all);
    return n;
  },

  async getWalkCache() {
    return readJson<WalkCache>("walk-cache.json", {});
  },

  async setWalkEntries(listingId, entries) {
    const cache = readJson<WalkCache>("walk-cache.json", {});
    cache[listingId] = entries;
    writeJson("walk-cache.json", cache);
  },

  async addPricePoints(points) {
    const all = readJson<PricePoint[]>("price-history.json", []);
    all.push(...points);
    writeJson("price-history.json", all);
  },

  async listPriceHistory() {
    return readJson<PricePoint[]>("price-history.json", []);
  },
};

/* -------------------------- supabase backend -------------------------- */

function rowToListing(r: Record<string, unknown>): Listing {
  return {
    id: r.id as string,
    source: r.source as Listing["source"],
    sourceId: r.source_id as string,
    url: r.url as string | null,
    title: r.title as string,
    priceRm: r.price_rm as number,
    roomType: r.room_type as Listing["roomType"],
    propertyName: r.property_name as string | null,
    area: r.area as string | null,
    address: r.address as string | null,
    lat: r.lat as number,
    lng: r.lng as number,
    photos: (r.photos ?? []) as string[],
    furnished: r.furnished as string | null,
    availableFrom: r.available_from as string | null,
    gender: (r.gender ?? null) as Listing["gender"],
    minTermMonths: (r.min_term_months ?? null) as number | null,
    notes: r.notes as string | null,
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
    isActive: r.is_active as boolean,
  };
}

function listingToRow(l: Partial<Listing>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (l.id !== undefined) row.id = l.id;
  if (l.source !== undefined) row.source = l.source;
  if (l.sourceId !== undefined) row.source_id = l.sourceId;
  if (l.url !== undefined) row.url = l.url;
  if (l.title !== undefined) row.title = l.title;
  if (l.priceRm !== undefined) row.price_rm = l.priceRm;
  if (l.roomType !== undefined) row.room_type = l.roomType;
  if (l.propertyName !== undefined) row.property_name = l.propertyName;
  if (l.area !== undefined) row.area = l.area;
  if (l.address !== undefined) row.address = l.address;
  if (l.lat !== undefined) row.lat = l.lat;
  if (l.lng !== undefined) row.lng = l.lng;
  if (l.photos !== undefined) row.photos = l.photos;
  if (l.furnished !== undefined) row.furnished = l.furnished;
  if (l.availableFrom !== undefined) row.available_from = l.availableFrom;
  if (l.gender !== undefined) row.gender = l.gender;
  if (l.minTermMonths !== undefined) row.min_term_months = l.minTermMonths;
  if (l.notes !== undefined) row.notes = l.notes;
  if (l.firstSeen !== undefined) row.first_seen = l.firstSeen;
  if (l.lastSeen !== undefined) row.last_seen = l.lastSeen;
  if (l.isActive !== undefined) row.is_active = l.isActive;
  return row;
}

/** PostgREST caps responses at 1000 rows; page through to get everything. */
async function selectAll(
  client: SupabaseClient,
  table: string,
  columns: string
): Promise<Record<string, unknown>[]> {
  const page = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from(table).select(columns).range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < page) break;
  }
  return out;
}

function makeSupabaseDb(client: SupabaseClient): Db {
  return {
    async listListings() {
      const data = await selectAll(client, "listings", "*");
      return data.map(rowToListing);
    },

    async upsertListings(rows) {
      // fetch existing keys to detect price changes / preserve first_seen
      const existing = (await selectAll(
        client,
        "listings",
        "id, source, source_id, price_rm, first_seen"
      )) as { id: string; source: string; source_id: string; price_rm: number; first_seen: string }[];
      const byKey = new Map(existing.map((r) => [`${r.source}|${r.source_id}`, r]));
      const pricePoints: PricePoint[] = [];
      let created = 0,
        updated = 0;
      const payload = rows.map((row) => {
        const prev = byKey.get(`${row.source}|${row.sourceId}`);
        if (prev) {
          updated++;
          if (prev.price_rm !== row.priceRm) {
            pricePoints.push({ listingId: prev.id, priceRm: row.priceRm, seenAt: row.lastSeen });
          }
          return listingToRow({ ...row, id: prev.id, firstSeen: prev.first_seen });
        }
        created++;
        pricePoints.push({ listingId: row.id, priceRm: row.priceRm, seenAt: row.firstSeen });
        return listingToRow(row);
      });
      const { error } = await client
        .from("listings")
        .upsert(payload, { onConflict: "source,source_id" });
      if (error) throw error;
      if (pricePoints.length) await this.addPricePoints(pricePoints);
      return { created, updated };
    },

    async createListing(row) {
      const { error } = await client.from("listings").insert(listingToRow(row));
      if (error) throw error;
    },

    async updateListing(id, patch) {
      const { error } = await client.from("listings").update(listingToRow(patch)).eq("id", id);
      if (error) throw error;
    },

    async deleteListing(id) {
      const { error } = await client.from("listings").delete().eq("id", id);
      if (error) throw error;
    },

    async deactivateStale(source, cutoffIso) {
      const { data, error } = await client
        .from("listings")
        .update({ is_active: false })
        .eq("source", source)
        .eq("is_active", true)
        .lt("last_seen", cutoffIso)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async getWalkCache() {
      const data = (await selectAll(client, "walk_cache", "*")) as {
        listing_id: string;
        station_id: string;
        walk_min: number;
        meters: number;
        routed: boolean;
      }[];
      const cache: WalkCache = {};
      for (const r of data) {
        (cache[r.listing_id] ??= []).push({
          stationId: r.station_id,
          walkMin: r.walk_min,
          meters: r.meters,
          routed: r.routed,
        });
      }
      return cache;
    },

    async setWalkEntries(listingId, entries) {
      const { error } = await client.from("walk_cache").upsert(
        entries.map((e) => ({
          listing_id: listingId,
          station_id: e.stationId,
          walk_min: e.walkMin,
          meters: e.meters,
          routed: e.routed,
        })),
        { onConflict: "listing_id,station_id" }
      );
      if (error) throw error;
    },

    async addPricePoints(points) {
      const { error } = await client.from("price_history").insert(
        points.map((p) => ({ listing_id: p.listingId, price_rm: p.priceRm, seen_at: p.seenAt }))
      );
      if (error) throw error;
    },

    async listPriceHistory() {
      const data = (await selectAll(client, "price_history", "*")) as {
        listing_id: string;
        price_rm: number;
        seen_at: string;
      }[];
      return data.map((r) => ({
        listingId: r.listing_id,
        priceRm: r.price_rm,
        seenAt: r.seen_at,
      }));
    },
  };
}

/* ------------------------------- export ------------------------------- */

let db: Db;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (url && key) {
  db = makeSupabaseDb(createClient(url, key, { auth: { persistSession: false } }));
} else {
  db = fileDb;
}

export { db };
export const dbBackend = url && key ? "supabase" : "file";
