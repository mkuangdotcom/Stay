# Stay — KL rentals by rail commute

Personal, private map for hunting rooms and units in Kuala Lumpur. Every listing is
plotted against the full KL rail network with a computed door-to-door commute to the
office (default: First Avenue, Bandar Utama — drag the yellow pin to change it).

- **Map**: MapLibre + OpenFreeMap tiles; all 8 rail lines toggleable, drawn from the
  official GTFS feed in their official colors, plus toggleable MRT/LRT feeder-bus
  routes (headways derived from the schedule).
- **Commute**: walk to the nearest stations (real OSRM foot routes, cached) + scheduled
  ride times from GTFS + transfer/wait penalties, Dijkstra over the network. Listings
  near the office get a plain walking estimate instead.
- **Filters**: price, room type, source, max walk-to-rail, max door-to-door, keyword.
- **Stats**: min/median/max, price histogram, median by nearest station — always for
  the current filter.
- **Sources**: iBilik, mudah.my (rooms + apartments; area-centroid pins) and
  SpeedHome scrapers (automated daily); quick-add form for Facebook/WhatsApp/anything.
  Listings carry tenant-gender restrictions and minimum-stay months where stated.
  at `/admin`. mudah.my & SpeedHome are phase 2.

Everything runs on free tiers: Vercel Hobby, Supabase free, data.gov.my GTFS,
OpenFreeMap, FOSSGIS OSRM, Nominatim.

## Commands

```bash
npm run dev            # app on http://localhost:3000
npm run ingest:gtfs    # refresh data/rail.json + rail-graph.json from data.gov.my
npm run scrape         # scrape iBilik + mudah.my, compute walk times (all configured areas)
npm run scrape -- --areas=kuala-lumpur/ttdi --max-pages=1   # targeted run
npm run scrape -- --refresh                                 # re-fetch known listings too
npm run build          # production build
```

Scraper areas, page caps, and rate limits live in `scripts/config.ts`.

## Storage

With no env vars set, data lives in `.data/*.json` (gitignored) — fine for
local-only use. Set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` and both the app and
the scraper switch to Supabase, which is what the deployed site uses.

## Deploying (one-time, ~15 minutes)

1. **Supabase**: create a free project at supabase.com → SQL editor → paste and run
   `supabase/schema.sql`. Grab *Project Settings → API*: the URL and the
   `service_role` key.
2. **Local `.env.local`** (`cp .env.example .env.local`): set `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SITE_PASSWORD`. Run `npm run scrape` once to fill the DB.
3. **Vercel**: push this repo to GitHub → vercel.com → *Import project* → add the same
   three env vars → deploy. The site reads Supabase live, so scrapes appear without
   redeploying.
4. **Scheduling** (either works, data lands in the same DB):
   - *GitHub Actions* (hands-off): repo → Settings → Secrets → add `SUPABASE_URL` and
     `SUPABASE_SERVICE_KEY`. The workflow in `.github/workflows/scrape.yml` runs daily
     at 09:23 MYT; trigger it manually once from the Actions tab to test. It probes
     iBilik first — if GitHub's IPs are blocked you'll see the probe step fail.
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
