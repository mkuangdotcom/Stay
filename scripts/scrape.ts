/**
 * Scrape rental sources into the database (file backend locally,
 * Supabase when SUPABASE_URL + SUPABASE_SERVICE_KEY are set).
 *
 *   npm run scrape                                 # all areas, default caps
 *   npm run scrape -- --areas=selangor/bandar-utama,kuala-lumpur/ttdi
 *   npm run scrape -- --max-pages=5 --refresh      # deeper crawl, re-fetch details
 *   npm run scrape -- --skip-walk                  # skip OSRM walk-time routing
 */
import "./lib/env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IBILIK_AREAS,
  MUDAH_AREAS,
  MAX_PAGES_PER_AREA,
  DETAIL_REFRESH_HOURS,
  STALE_AFTER_DAYS,
} from "./config";
import { ibilik, type SourceAdapter } from "./adapters/ibilik";
import { mudah } from "./adapters/mudah";
import type { Listing, WalkEntry } from "../lib/types";

const args = new Map<string, string>(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  })
);

const ADAPTERS: Record<string, SourceAdapter> = { ibilik, mudah };
const AREA_DEFAULTS: Record<string, string[]> = { ibilik: IBILIK_AREAS, mudah: MUDAH_AREAS };

async function main() {
  const { db, dbBackend } = await import("../lib/db");
  console.log(`Storage backend: ${dbBackend}`);

  const sourceNames = (args.get("source") ?? "ibilik,mudah").split(",");
  const maxPages = Number(args.get("max-pages") ?? MAX_PAGES_PER_AREA);
  const refreshAll = args.has("refresh");
  const dryRun = args.has("dry-run");

  const existing = await db.listListings();
  const freshCutoff = Date.now() - DETAIL_REFRESH_HOURS * 3600 * 1000;

  for (const name of sourceNames) {
    const adapter = ADAPTERS[name];
    if (!adapter) {
      console.error(`No adapter named "${name}" (available: ${Object.keys(ADAPTERS).join(", ")})`);
      continue;
    }
    const areas = args.get("areas")?.split(",") ?? AREA_DEFAULTS[name] ?? [];
    const known = new Map(
      existing.filter((l) => l.source === adapter.name).map((l) => [l.sourceId, l])
    );

    console.log(`\n=== ${adapter.name}: ${areas.length} areas × ${maxPages} pages ===`);
    const found = new Map<string, string>(); // sourceId -> detail url
    for (const area of areas) {
      for (let page = 1; page <= maxPages; page++) {
        try {
          const links = await adapter.listPage(area, page);
          for (const l of links) found.set(l.sourceId, l.url);
          process.stdout.write(`  ${area} p${page}: ${links.length} links (total ${found.size})\n`);
          if (links.length === 0) break;
        } catch (e) {
          console.error(`  ${area} p${page}: ${(e as Error).message}`);
          break;
        }
      }
    }

    const rows: Listing[] = [];
    const now = new Date().toISOString();
    let fetched = 0,
      skippedFresh = 0,
      failed = 0;
    for (const [sourceId, url] of found) {
      const prev = known.get(sourceId);
      if (prev && !refreshAll && new Date(prev.lastSeen).getTime() > freshCutoff) {
        rows.push({ ...prev, lastSeen: now, isActive: true });
        skippedFresh++;
        continue;
      }
      try {
        const listing = await adapter.fetchDetail(url, sourceId);
        if (listing) {
          rows.push(listing);
          fetched++;
          if (fetched % 10 === 0) process.stdout.write(`  …${fetched} details fetched\n`);
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
        console.error(`  detail ${sourceId}: ${(e as Error).message}`);
      }
    }
    console.log(
      `  details: ${fetched} fetched, ${skippedFresh} still fresh (skipped), ${failed} failed`
    );

    if (dryRun) {
      console.log(`  DRY RUN — first row:\n`, rows[0]);
    } else {
      const { created, updated } = await db.upsertListings(rows);
      const deactivated = await db.deactivateStale(
        adapter.name,
        new Date(Date.now() - STALE_AFTER_DAYS * 86400 * 1000).toISOString()
      );
      console.log(`  upserted: ${created} new, ${updated} updated; ${deactivated} marked gone`);
    }
    await adapter.close?.();
  }

  if (!dryRun && !args.has("skip-walk")) await computeWalkTimes();
  console.log("\nDone.");
}

/** Fill walk_cache: real OSRM foot routes to the 3 nearest stations, for listings that lack them. */
async function computeWalkTimes() {
  const { db } = await import("../lib/db");
  const { RailGraph } = await import("../lib/railGraph");
  const { walkingRoute } = await import("./lib/osrm");
  const graphData = JSON.parse(
    readFileSync(join(process.cwd(), "data", "rail-graph.json"), "utf8")
  );
  const graph = new RailGraph(graphData);

  const [listings, cache] = await Promise.all([db.listListings(), db.getWalkCache()]);
  const pending = listings.filter((l) => l.isActive && !cache[l.id]?.some((e) => e.routed));
  const budget = Number(args.get("walk-budget") ?? 150); // max listings routed per run
  console.log(`\n=== walk times: ${pending.length} listings need routing (budget ${budget}) ===`);

  let done = 0;
  for (const l of pending.slice(0, budget)) {
    const nearest = graph.nearestStations(l.lat, l.lng, 3, 35, true); // rail only — bus-stop walks are short, estimates suffice
    const entries: WalkEntry[] = [];
    for (const st of nearest) {
      const route = await walkingRoute({ lat: l.lat, lng: l.lng }, { lat: st.lat, lng: st.lng });
      entries.push(
        route
          ? { stationId: st.id, walkMin: round1(route.minutes), meters: Math.round(route.meters), routed: true }
          : { stationId: st.id, walkMin: round1(st.walkMin), meters: Math.round(st.meters), routed: false }
      );
    }
    if (entries.length) await db.setWalkEntries(l.id, entries);
    done++;
    if (done % 20 === 0) console.log(`  …${done} routed`);
  }
  console.log(`  routed ${done} listings`);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
