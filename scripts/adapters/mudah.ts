/**
 * mudah.my rooms-for-rent adapter. Mudah 403s plain HTTP, so list pages are
 * loaded through headless Chromium (Playwright, dynamically imported).
 *
 * Everything we need lives in the list page's __NEXT_DATA__ (40 ads/page), so
 * fetchDetail makes NO network request — it reads the cached list entry. The
 * trade-off: mudah publishes no coordinates, so pins are the listing's subarea
 * centroid (geocoded once per area via Nominatim, cached for the run) plus a
 * small deterministic jitter; listings are flagged approximate in notes.
 */
import type { Listing, RoomType } from "../../lib/types";
import type { SourceAdapter } from "./ibilik";
import { REQUEST_DELAY_MS, USER_AGENT, MUDAH_MAX_KM_FROM_CENTER } from "../config";
import { haversineMeters } from "../../lib/geo";

const BASE = "https://www.mudah.my";
const GEO_CENTER = { lat: 3.14, lng: 101.69 }; // KL city — bounds the conurbation
const JITTER_DEG = 0.0022; // ~±250 m, so area-centroid pins don't stack

interface MudahAd {
  listId: number;
  subject: string;
  monthlyRent?: number;
  priceLabel?: string;
  subareaName?: string;
  regionName?: string;
  locationLabel?: string;
  adviewUrl: string;
  image?: string;
  extraImages?: string[];
  propertyTypeName?: string;
  imageBase?: string;
}

/* ------------------------- playwright session ------------------------- */

type PWPage = {
  goto(url: string, opts: object): Promise<{ status(): number } | null>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
};
let pagePromise: Promise<PWPage> | null = null;
let closeBrowser: (() => Promise<void>) | null = null;

async function getPage(): Promise<PWPage> {
  if (!pagePromise) {
    pagePromise = (async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch();
      closeBrowser = () => browser.close();
      const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "en-MY" });
      return (await ctx.newPage()) as unknown as PWPage;
    })();
  }
  return pagePromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const politePause = () => sleep(REQUEST_DELAY_MS + Math.random() * 600);

/* ----------------------------- geocoding ------------------------------ */

const geoCache = new Map<string, { lat: number; lng: number } | null>();
let lastGeocodeAt = 0;

async function geocodeArea(query: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache.has(query)) return geoCache.get(query)!;
  const wait = lastGeocodeAt + 1100 - Date.now(); // Nominatim: max 1 req/s
  if (wait > 0) await sleep(wait);
  lastGeocodeAt = Date.now();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "my");
    const res = await fetch(url, { headers: { "user-agent": "stay-personal-rent-map/0.1" } });
    const data = (await res.json()) as { lat: string; lon: string }[];
    const hit = data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon) } : null;
    geoCache.set(query, hit);
    return hit;
  } catch {
    geoCache.set(query, null);
    return null;
  }
}

/** Deterministic per-listing offset so stacked centroid pins spread out. */
function jitter(sourceId: string): { dLat: number; dLng: number } {
  let h = 2166136261;
  for (const c of sourceId) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 10) >>> 0) % 1000) / 1000;
  return { dLat: (a - 0.5) * 2 * JITTER_DEG, dLng: (b - 0.5) * 2 * JITTER_DEG };
}

/* ------------------------------ adapter ------------------------------- */

const adCache = new Map<string, MudahAd>();

export const mudah: SourceAdapter = {
  name: "mudah",

  async listPage(area, page) {
    const p = await getPage();
    await politePause();
    const url = `${BASE}/${area}${page > 1 ? `?o=${page}` : ""}`;
    const resp = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!resp || resp.status() !== 200) throw new Error(`HTTP ${resp?.status() ?? "?"} on ${url}`);
    await p.waitForTimeout(1200);
    const ads = await p.evaluate(() => {
      const raw = document.getElementById("__NEXT_DATA__")?.textContent;
      if (!raw) return [];
      const j = JSON.parse(raw);
      const list = j?.props?.pageProps?.initialStore?.ads ?? [];
      return list.map((a: { attributes: Record<string, unknown>; links?: Record<string, string> }) => ({
        ...a.attributes,
        imageBase: a.links?.imageBaseurl,
      }));
    });
    const out: { url: string; sourceId: string }[] = [];
    for (const ad of ads as MudahAd[]) {
      if (!ad.listId || !ad.adviewUrl) continue;
      const sourceId = String(ad.listId);
      adCache.set(sourceId, ad);
      out.push({ url: ad.adviewUrl, sourceId });
    }
    return out;
  },

  // No network: parses the ad captured from the list page.
  async fetchDetail(url, sourceId) {
    const ad = adCache.get(sourceId);
    if (!ad) return null;

    const priceRm = Number(ad.monthlyRent ?? String(ad.priceLabel ?? "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(priceRm) || priceRm <= 0) return null;

    const areaName = ad.subareaName || ad.locationLabel || ad.regionName;
    if (!areaName) return null;
    const centroid = await geocodeArea(`${areaName}, ${ad.regionName ?? "Kuala Lumpur"}, Malaysia`);
    if (!centroid) return null;
    if (haversineMeters(centroid.lat, centroid.lng, GEO_CENTER.lat, GEO_CENTER.lng) > MUDAH_MAX_KM_FROM_CENTER * 1000) {
      return null; // outside the commutable conurbation — don't store it
    }
    const { dLat, dLng } = jitter(sourceId);

    const photos: string[] = [];
    const base = ad.imageBase ?? "https://img.rnudah.com/images";
    for (const img of [ad.image, ...(ad.extraImages ?? [])]) {
      if (typeof img === "string" && img) photos.push(img.startsWith("http") ? img : `${base}${img}`);
      if (photos.length >= 6) break;
    }

    const now = new Date().toISOString();
    return {
      id: `mudah_${sourceId}`,
      source: "mudah",
      sourceId,
      url,
      title: ad.subject,
      priceRm,
      roomType: guessRoomType(ad.subject, ad.propertyTypeName),
      propertyName: null,
      area: areaName,
      address: ad.locationLabel ?? null,
      lat: centroid.lat + dLat,
      lng: centroid.lng + dLng,
      photos,
      furnished: null,
      availableFrom: null,
      notes: `Pin is approximate (${areaName} area — mudah publishes no exact coordinates).`,
      firstSeen: now,
      lastSeen: now,
      isActive: true,
    };
  },

  async close() {
    if (closeBrowser) await closeBrowser();
    pagePromise = null;
    closeBrowser = null;
  },
};

function guessRoomType(title: string, propertyType?: string): RoomType {
  const t = title.toLowerCase();
  if (/\bmaster\b/.test(t)) return "master";
  if (/\b(middle|medium|tengah)\b/.test(t)) return "medium";
  if (/\b(small|kecil)\b/.test(t) || /\bsingle\s*(bed)?room\b/.test(t)) return "small";
  if (/\bstudio\b/.test(t)) return "studio";
  if (/\b(whole|entire)\s*(unit|house|apartment|condo)\b/.test(t)) return "unit";
  if (propertyType && propertyType !== "Room") return "unit";
  return "unknown";
}
