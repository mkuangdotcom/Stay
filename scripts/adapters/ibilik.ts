import * as cheerio from "cheerio";
import type { Listing, RoomType } from "../../lib/types";
import { fetchText } from "../lib/http";
import { extractGender, extractMinTerm } from "../lib/extract";
import { normalizePhoneMY } from "../../lib/contact";

const BASE = "https://www.ibilik.com";

export interface SourceAdapter {
  name: Listing["source"];
  /** Returns detail-page URLs for an area index page (1-based). */
  listPage(area: string, page: number): Promise<{ url: string; sourceId: string }[]>;
  /** Fetches and parses one listing's detail page. Returns null if unparseable.
   *  `prev` is the stored row from earlier runs, for fields the source only
   *  publishes intermittently (e.g. mudah phones). */
  fetchDetail(url: string, sourceId: string, prev?: Listing): Promise<Listing | null>;
  /** True when fetchDetail costs no network request — skip the freshness shortcut. */
  alwaysRefreshDetails?: boolean;
  /** Release resources (e.g. a headless browser) after the run. */
  close?(): Promise<void>;
}

export const ibilik: SourceAdapter = {
  name: "ibilik",

  async listPage(area, page) {
    const url =
      page === 1
        ? `${BASE}/locations/malaysia/${area}/room-rentals?sort=most-recent`
        : `${BASE}/locations/malaysia/${area}/room-rentals/page/${page}?sort=most-recent`;
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const out = new Map<string, { url: string; sourceId: string }>();
    $('a[href^="/room-rentals/"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const m = href.match(/^\/room-rentals\/([0-9a-f-]{36})\//);
      if (m) out.set(m[1], { url: `${BASE}${href}`, sourceId: m[1] });
    });
    return [...out.values()];
  },

  async fetchDetail(url, sourceId) {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    // RSC flight data escapes quotes; unescape once so regexes work on plain JSON
    const flat = html.replace(/\\"/g, '"');

    const title = $("h1").first().text().trim() || $('meta[property="og:title"]').attr("content")?.trim();
    if (!title) return null;

    const priceMatch =
      flat.match(/"price":(\d+(?:\.\d+)?),"priceUnit":"month"/) ??
      $("body")
        .text()
        .match(/RM\s?([0-9,]+)\s*(?:\/|per\s)?\s*month/i);
    const priceRm = priceMatch ? Number(String(priceMatch[1]).replace(/,/g, "")) : NaN;

    const coordMatch = flat.match(/query=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{2,3}\.\d+)/);
    if (!coordMatch) return null;
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 0.8 || lat > 7.5) return null;

    const photos = new Set<string>();
    for (const m of flat.matchAll(
      /https:\/\/(?:assets-prod|legacy-assets)\.ibilik\.com\/[^\s"',)\\]+\.(?:jpe?g|png|webp)/g
    )) {
      photos.add(m[0]);
      if (photos.size >= 8) break;
    }

    // breadcrumb: /locations/malaysia/<region>/<area>/room-rentals
    let area: string | null = null;
    $('a[href^="/locations/malaysia/"]').each((_, el) => {
      const m = ($(el).attr("href") ?? "").match(
        /^\/locations\/malaysia\/[a-z-]+\/([a-z0-9-]+)\/room-rentals$/
      );
      if (m) area = m[1];
    });
    const prettyArea = area
      ? (area as string).replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null;

    // contactOptions in the flight data: prefer the WHATSAPP channel, fall back to PHONE
    const wa = flat.match(/"channel":"WHATSAPP","contactValue":"([+\d][\d ()-]{7,18})"/);
    const tel = flat.match(/"channel":"PHONE","contactValue":"([+\d][\d ()-]{7,18})"/);
    const phone = normalizePhoneMY(wa?.[1] ?? tel?.[1]);
    const agent = flat.match(/"agentName":"([^"\\]{1,60})"/);

    const now = new Date().toISOString();
    if (!Number.isFinite(priceRm) || priceRm <= 0) return null;

    return {
      id: `ibilik_${sourceId}`,
      source: "ibilik",
      sourceId,
      url,
      title,
      priceRm,
      roomType: guessRoomType(title),
      propertyName: guessPropertyName(title),
      area: prettyArea,
      address: null,
      lat,
      lng,
      photos: [...photos],
      furnished: /fully\s?furnish/i.test(flat) ? "Fully furnished" : /partial(ly)?\s?furnish/i.test(flat) ? "Partially furnished" : null,
      availableFrom: null,
      gender: extractGender(title),
      minTermMonths: extractMinTerm(title),
      phone,
      contactName: agent?.[1]?.trim() || null,
      notes: null,
      firstSeen: now,
      lastSeen: now,
      isActive: true,
    };
  },
};

function guessRoomType(title: string): RoomType {
  const t = title.toLowerCase();
  if (/\bmaster\b/.test(t)) return "master";
  if (/\b(middle|medium|tengah)\b/.test(t)) return "medium";
  if (/\b(small|kecil)\b/.test(t) || /\bsingle\s*(bed)?room\b/.test(t) || /\bsingle room\b/.test(t)) return "small";
  if (/\bstudio\b/.test(t)) return "studio";
  if (/\b(whole|entire)\s*(unit|house|apartment|condo)\b/.test(t)) return "unit";
  return "unknown";
}

/** Condo/taman name often follows "at/in/@" in iBilik titles. */
function guessPropertyName(title: string): string | null {
  const m = title.match(/(?:\bat\b|\bin\b|@)\s*([A-Z][\w' ]{3,40}?)(?:\s*[,|–—-]|\s*$)/);
  return m ? m[1].trim() : null;
}
