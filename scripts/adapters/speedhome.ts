/**
 * SpeedHome adapter. 403s plain HTTP → list pages via headless Chromium.
 * The list page's __NEXT_DATA__ carries fully structured listings (40/page):
 * real coordinates, tenant gender preference, minimum tenancy, availability,
 * furnishing, zero-deposit flag — so fetchDetail makes no network requests.
 */
import type { Gender, Listing, RoomType } from "../../lib/types";
import type { SourceAdapter } from "./ibilik";
import { REQUEST_DELAY_MS, USER_AGENT } from "../config";

const BASE = "https://speedhome.com";
const IMG = "https://image.speedhome.com/speedrent-backend/images/property";

interface SpeedHomeProperty {
  id: number;
  name: string;
  price: number;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  slug: string;
  active?: boolean;
  isRented?: boolean;
  roomType?: "SMALL" | "MEDIUM" | "MASTER" | null;
  furnishType?: "FULL" | "PARTIAL" | "NONE" | null;
  minRentalDuration?: number | null;
  availability?: string | null;
  noDeposit?: boolean;
  petFriendly?: boolean;
  sqft?: number | null;
  bedroom?: number | null;
  bathroom?: number | null;
  images?: { code: string; coverPhoto?: boolean }[];
  propertyTenantPreference?: { gender?: "ALL" | "FEMALE" | "MALE"; tenancyDuration?: number } | null;
}

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

const cache = new Map<string, SpeedHomeProperty>();

export const speedhome: SourceAdapter = {
  name: "speedhome",
  alwaysRefreshDetails: true,

  async listPage(area, page) {
    const p = await getPage();
    await sleep(REQUEST_DELAY_MS + Math.random() * 600);
    const url = `${BASE}/rent/${area}${page > 1 ? `?page=${page}` : ""}`;
    const resp = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!resp || resp.status() !== 200) throw new Error(`HTTP ${resp?.status() ?? "?"} on ${url}`);
    await p.waitForTimeout(1500);
    const props = await p.evaluate(() => {
      const raw = document.getElementById("__NEXT_DATA__")?.textContent;
      if (!raw) return [];
      const j = JSON.parse(raw);
      return j?.props?.pageProps?.propertyList?.content ?? [];
    });
    const out: { url: string; sourceId: string }[] = [];
    for (const prop of props as SpeedHomeProperty[]) {
      if (!prop.id || !prop.slug) continue;
      if (prop.isRented || prop.active === false) continue;
      const sourceId = String(prop.id);
      cache.set(sourceId, prop);
      out.push({ url: `${BASE}/rent/${prop.slug}`, sourceId });
    }
    return out;
  },

  // No network: everything came structured from the list page.
  async fetchDetail(url, sourceId) {
    const prop = cache.get(sourceId);
    if (!prop) return null;
    if (!Number.isFinite(prop.price) || prop.price <= 0) return null;
    if (!Number.isFinite(prop.latitude) || prop.latitude < 0.8 || prop.latitude > 7.5) return null;

    // photo host groups images under the property code = slug's last segment
    const code = prop.slug.split("-").pop()?.toUpperCase() ?? "";
    const photos = (prop.images ?? [])
      .slice(0, 6)
      .map((i) => `${IMG}/${code}/${i.code}-medium.jpg`);

    const pref = prop.propertyTenantPreference ?? null;
    const gender: Gender | null =
      pref?.gender === "FEMALE" ? "female" : pref?.gender === "MALE" ? "male" : null;

    const notes = [
      prop.noDeposit ? "Zero deposit." : null,
      prop.petFriendly ? "Pet friendly." : null,
      prop.bedroom ? `${prop.bedroom}bd/${prop.bathroom ?? "?"}ba${prop.sqft ? `, ${prop.sqft} sqft` : ""}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const now = new Date().toISOString();
    return {
      id: `speedhome_${sourceId}`,
      source: "speedhome",
      sourceId,
      url,
      title: prop.name,
      priceRm: prop.price,
      roomType: mapRoomType(prop.roomType),
      propertyName: prop.name?.split(",")[0]?.trim() || null,
      area: prop.city ?? null,
      address: prop.address ?? null,
      lat: prop.latitude,
      lng: prop.longitude,
      photos,
      furnished:
        prop.furnishType === "FULL"
          ? "Fully furnished"
          : prop.furnishType === "PARTIAL"
            ? "Partially furnished"
            : null,
      availableFrom: prop.availability?.slice(0, 10) ?? null,
      gender,
      minTermMonths: prop.minRentalDuration ?? pref?.tenancyDuration ?? null,
      phone: null, // SpeedHome hides contacts behind its own chat
      contactName: null,
      notes: notes || null,
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

function mapRoomType(rt: SpeedHomeProperty["roomType"]): RoomType {
  if (rt === "SMALL") return "small";
  if (rt === "MEDIUM") return "medium";
  if (rt === "MASTER") return "master";
  return "unit"; // whole-property listing
}
