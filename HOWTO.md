# How to use Stay

Stay is your private map of KL room & unit rentals, ranked by real door-to-door
commute time. It refreshes itself every morning — you just browse.

**The site:** https://stay-eight-kappa.vercel.app

---

## Signing in

Username `mkuangdotcom` + the site password. The exit icon at the top-right
of the sidebar signs you out.

---

## Reading the map

- **Dots** are listings. Color = commute time (green ≤20 min → red 65 min+), or
  price if you switch *Color: price* at the bottom of the sidebar. Dark circles
  with numbers are clusters — click to zoom in.
- **Gray-ringed dots** mean the position is approximate (mudah doesn't publish
  exact coordinates — the pin is the neighbourhood centre). White-ringed dots
  are exact.
- **Rail lines** are drawn in their official colors. The chips at the top toggle
  each line, **Bus** toggles the MRT/LRT feeder-bus network (on the map *and* in
  the commute math), and **Zones** shades everywhere within 30 / 45 / 60 min
  door-to-door of your destination — green / amber / red.
- The **yellow pulsing pin** is your destination (default: First Avenue,
  Bandar Utama). **Drag it** anywhere, or type an address in the sidebar's
  *"Search address or place…"* box — every commute recalculates instantly.
  *Reset to First Avenue* brings it back.

## The sidebar

Filters combine — everything updates live:

- **Rent RM** — min/max price.
- **Room type** — Master / Medium / Small / Studio / Whole unit.
- **Walk to rail** and **Door to door** sliders — max walking minutes to a
  station, and max total commute.
- **Keyword** — searches titles, condo names, areas, notes.
- **I am ♀/♂** — hides listings restricted to the other gender ("female only"
  ads disappear if you pick Male, and vice versa).
- **Stay ≤ 3/6/12 mo** — hides listings demanding a longer commitment than
  you want (SpeedHome publishes this; other sources when the ad states it).
- **Posted 24h/3d/7d/30d** — only fresh listings. Green **new** badges mark
  listings that appeared in the last 24 hours.
- **Source chips** — iBilik / Mudah / SpeedHome / Facebook / Manual.
- **Show gone** — include listings that vanished from their source (grayed out).
- **★ Favs** (next to the count) — only your starred listings.

Below the filters: rent stats for whatever is currently in view (min / median /
max, a price histogram, and median rent per nearest station).

## Working a listing

Click any row or dot:

- **Door to door** shows the full route: walk → line(s) → transfer → walk,
  with minutes per leg. Bus legs show the feeder number (T812 etc.).
- **Price history** button — a chart if the asking price ever changed, or
  "no changes since …" if it hasn't.
- **☆ star** (top-right) — adds to your shortlist. Stars sync through the
  database, so they're the same on your phone and laptop.
- **Open listing ↗** — the original ad, to contact the lister.
- **Tenant / Min stay rows** — gender restriction and minimum tenancy, when known.
- Mudah listings carry a note that their pin is approximate — verify the actual
  address in the original ad.

## Adding your own finds (Facebook, WhatsApp, agents)

**+ Add listing** (owner only) opens the admin page:

1. Fill in the title, price, room type, and set the source (e.g. Facebook).
2. Set *Tenant restriction* and *Min stay* if the post mentions them.
3. Drop the pin: search a place or click the mini-map. **The pin is required** —
   it's what powers the commute.
4. Paste photo URLs one per line (optional). Save.

The same page edits or deletes any listing (there's an *Edit* button on every
listing's detail card too).

## How the data works (so you can trust it)

- **Sources**: iBilik (exact pins), mudah.my rooms + apartments (area-level
  pins), SpeedHome (exact pins, structured min-stay/gender), plus whatever you
  add manually.
- **Refresh**: a GitHub Action scrapes daily at **9:23 AM MYT** and marks
  listings gone after 3 days missing. No action needed from you.
- **Commutes** use the official Prasarana GTFS schedules: scheduled ride times,
  half-headway waiting at boarding and transfers, feeder buses, and walking at
  4.6 km/h with a 1.35× street-detour factor. Listings near stations get real
  OSRM street-routed walking times (marked; others say "estimate").
- **Prices** are tracked daily per listing — that's what feeds the chart.

## A good hunting loop

1. Turn on **Zones**, set **Door to door ≤ 45**, **Posted ≤ 3d**, your price cap,
   and **I am ♀/♂**.
2. Sort by *Shortest commute*. Star anything promising.
3. Switch to **★ Favs**, compare, and *Open listing ↗* to message fast —
   good rooms in KL go in days.

---

*Ops notes (owner): code lives at github.com/mkuangdotcom/Stay; deploys via
`vercel --prod`; scraper config in `scripts/config.ts`; see README.md for
architecture and AGENTS.md for scraper specifics.*
