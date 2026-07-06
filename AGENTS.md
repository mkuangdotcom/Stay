<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Stay — project notes

Personal KL rental-finder map. See README.md for architecture and commands.

- **Next 16 quirks already handled here**: `proxy.ts` replaces `middleware.ts`
  (deprecated); fonts are self-hosted in `app/fonts/` via `next/font/local`
  (build-time Google Fonts fetches fail in sandboxed environments).
- **Storage switches on env**: no `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` → JSON files
  in `.data/` (gitignored); with them → Supabase. One interface: `lib/db.ts`.
- **`data/rail*.json` are generated** by `npm run ingest:gtfs` — never hand-edit;
  re-run the script instead. They include the MRT/LRT feeder-bus network
  (rapid-bus-mrtfeeder GTFS; headways derived from weekday departures). The commute
  engine (`lib/railGraph.ts`) is pure and shared by the browser and the scraper.
- **Scraper etiquette is deliberate** (`scripts/config.ts`): ~1 req/1.6s + jitter,
  detail pages skipped if seen in the last 20h, OSRM capped at 1 req/s. Keep it that
  way — the sources and free routing servers are shared infrastructure.
- **SpeedHome specifics**: 403s plain HTTP → Playwright; list-page `__NEXT_DATA__`
  (`propertyList.content`) is fully structured — real coords, tenant gender,
  `minRentalDuration` — zero detail fetches. `?page=N` pagination is flaky for KL.
- **mudah.my specifics**: 403s plain HTTP → list pages load via headless Chromium
  (Playwright); all fields come from list-page `__NEXT_DATA__` so no detail-page
  requests are made; no coordinates published → pins are Nominatim area-centroids
  with deterministic jitter, flagged in `notes`.
- **iBilik specifics**: area pages are server-rendered (15 cards/page), price lives in
  RSC flight data (`"price":N,"priceUnit":"month"`), coordinates in a Google Maps
  `query=lat,lng` link, photos on `assets-prod` or `legacy-assets` hosts. Datacenter
  IPs are sometimes 403'd — the GitHub Actions workflow probes reachability first.
- **Verify UI changes with Playwright** (installed in the session scratchpad, needs
  `--use-gl=swiftshader --enable-unsafe-swiftshader` for MapLibre in headless).