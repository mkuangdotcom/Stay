# Stay — KL rentals by rail commute

Personal, private map for hunting rooms and units in Kuala Lumpur. Every listing is
plotted against the full KL rail network with a computed door-to-door commute to the
destination (default: First Avenue, Bandar Utama — drag the yellow pin or search an
address to change it). Usage guide for humans: [HOWTO.md](HOWTO.md).

- **Map**: MapLibre + OpenFreeMap tiles; all 8 rail lines toggleable, drawn from the
  official GTFS feed in their official colors, plus toggleable MRT/LRT feeder-bus
  routes (headways derived from the schedule) and a travel-time heatmap — every
  ~275 m cell shaded by door-to-door minutes with a 15–90 min slider that filters
  instantly (`lib/travelTime.ts`; the surface recomputes only when the pin moves).
- **Commute**: walk to the nearest stations/stops (real OSRM foot routes, cached) +
  scheduled ride times from GTFS + transfer/wait penalties, Dijkstra over the
  network. Listings near the destination get a plain walking estimate instead.
- **Filters**: price, room type, source, max walk-to-rail, max door-to-door, keyword,
  tenant gender, max commitment (min-stay months), posted-within, starred only.
- **Per listing**: full route legs, price-history chart, shortlist star (synced via
  the DB), gender/min-stay when stated, lister phone/name where the source
  publishes them (iBilik, Mudah).
- **Outreach**: one-tap WhatsApp with a templated message (`lib/contact.ts`), and a
  `/tracker` pipeline page — status/channel/viewing/agreed-rent/utilities per
  contacted listing, with the auto-computed commute (manually overridable).
  Track/re-stage from the sidebar list, filter the map by pipeline stage, and
  edit a listing's address in the tracker — geocoding it moves the map pin and
  resets the walk cache so the commute recomputes.
- **Stats**: min/median/max, price histogram, median by nearest station — always for
  the current filter.
- **Sources**: iBilik, mudah.my (rooms + apartments; area-centroid pins) and
  SpeedHome (exact pins, structured tenancy fields) scraped daily; quick-add form at
  `/admin` for Facebook/WhatsApp/anything.

One account gates the site: `ADMIN_USERNAME` + `SITE_PASSWORD`. Everything runs on
free tiers: Vercel Hobby, Supabase free, data.gov.my GTFS, OpenFreeMap, FOSSGIS
OSRM, Nominatim.

## Commands

```bash
npm run dev            # app on http://localhost:3000
npm run ingest:gtfs    # refresh data/rail.json + rail-graph.json from data.gov.my
npm run scrape         # scrape iBilik + mudah.my + SpeedHome, compute walk times
npm run scrape -- --source=ibilik --areas=kuala-lumpur/ttdi --max-pages=1  # targeted
npm run scrape -- --refresh                                 # re-fetch known listings too
npm run build          # production build
```

mudah.my and SpeedHome load through headless Chromium — run
`npx playwright install chromium` once before scraping locally.
Scraper areas, page caps, and rate limits live in `scripts/config.ts`.

## Storage

With no env vars set, data lives in `.data/*.json` (gitignored) — fine for
local-only use. Set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` and both the app and
the scraper switch to Supabase, which is what the deployed site uses.

## Deploying (one-time, ~15 minutes)

1. **Supabase**: create a free project at supabase.com → SQL editor → paste and run
   `supabase/schema.sql`. Grab *Project Settings → API*: the URL and the
   `service_role` key. (Re-running the file on an existing project is safe — it
   also applies column upgrades, so do that after pulling schema changes.)
2. **Local `.env.local`** (`cp .env.example .env.local`): set `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SITE_PASSWORD`, `ADMIN_USERNAME`. Run `npm run scrape`
   once to fill the DB.
3. **Vercel**: push this repo to GitHub → vercel.com → *Import project* → add the same
   four env vars → deploy. The site reads Supabase live, so scrapes appear without
   redeploying.
4. **Scheduling** (either works, data lands in the same DB):
   - *GitHub Actions* (hands-off): repo → Settings → Secrets → add `SUPABASE_URL` and
     `SUPABASE_SERVICE_KEY`. The workflow in `.github/workflows/scrape.yml` runs daily
     at 09:23 MYT; trigger it manually once from the Actions tab to test. It probes
     iBilik first — if GitHub's IPs are blocked it degrades to the browser-based
     sources instead of failing.
   - *This Mac* (reliable fallback): `./scripts/install-launchd.sh` — daily at 09:23,
     logs to `.data/scrape.log`.

Note: Supabase free projects pause after ~7 days without API traffic; a working daily
scrape keeps the project awake.

## How the pieces fit

```
GitHub Actions cron ──┐
Mac launchd job ──────┼─► scripts/scrape.ts ─► Supabase ◄─ Next.js on Vercel
manual npm run scrape ┘    (adapters/*.ts)    (or .data/)   map + /admin
                                                  ▲
scripts/gtfs-ingest.ts ─► data/rail*.json ────────┴─ shipped with the app
```

- `lib/railGraph.ts` — the commute engine (Dijkstra, transfers, headways, legs).
- `lib/db.ts` — one storage interface, file + Supabase backends.
- `scripts/adapters/ibilik.ts` — the source adapter pattern; add a new site by
  implementing `listPage()` + `fetchDetail()` and registering it in `scrape.ts`.
- Scraping is polite: ~1 request / 1.6 s with jitter, retries with backoff,
  personal use only.
