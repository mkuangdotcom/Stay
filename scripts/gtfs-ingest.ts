/**
 * Downloads the official Prasarana rapid-rail-kl GTFS feed (plus the
 * rapid-bus-mrtfeeder feed) and emits:
 *   data/rail.json       — lines (geometry, colors, headways) + stations + feeder-bus
 *                          routes/stops, for map rendering
 *   data/rail-graph.json — station+bus-stop graph with scheduled ride times and
 *                          walking transfers, used for commute (Dijkstra) computation
 *
 * Run: npm run ingest:gtfs
 */
import { unzipSync } from "fflate";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const GTFS_URL =
  process.env.GTFS_URL ??
  "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl";
const GTFS_FEEDER_URL =
  process.env.GTFS_FEEDER_URL ??
  "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder";
const OUT_DIR = join(import.meta.dirname, "..", "data");

// Walking speed and buffer used to price interchange (transfer) edges
const TRANSFER_WALK_MPS = 1.2;
const TRANSFER_BUFFER_SECS = 90;
const TRANSFER_MAX_METERS = 450;

// Feeder-bus specifics: stops sit at street level, so transfers to rail are
// shorter; headways are derived from weekday departures (no frequencies.txt).
const BUS_XFER_MAX_METERS = 300;
const BUS_XFER_BUFFER_SECS = 60;
const BUS_COLOR = "#2f8f83";

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "").replace(/\r/g, "");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    header.forEach((h, i) => (row[h.replace(/^﻿/, "")] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function hmsToSecs(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bKlcc\b/g, "KLCC")
    .replace(/\bKl\b/g, "KL")
    .replace(/\bUsj\b/g, "USJ")
    .replace(/\bTtdi\b/g, "TTDI")
    .replace(/\bUitm\b/g, "UiTM")
    .replace(/\bIoi\b/g, "IOI")
    .replace(/\bSs\b/g, "SS");
}

async function downloadGtfs(url: string) {
  console.log(`Downloading GTFS feed from ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(zip);
  return (name: string) => {
    const entry = Object.entries(files).find(([k]) => k.endsWith(name) && !k.startsWith("__MACOSX"));
    if (!entry) throw new Error(`${name} missing from GTFS zip`);
    return parseCsv(new TextDecoder().decode(entry[1]));
  };
}

interface FeederResult {
  busLines: {
    id: string;
    shortName: string;
    name: string;
    color: string;
    category: string;
    headwayMin: number;
    shape: [number, number][];
  }[];
  /** map dots only — [lng, lat]; full stop info lives in the graph nodes */
  busStops: [number, number][];
  busNodes: Record<
    string,
    { name: string; lat: number; lng: number; route: string; kind: "bus" }
  >;
  busEdges: [string, string, number, "ride" | "xfer"][];
  busHeadways: Record<string, number>;
}

/** Thin dashed map lines don't need GPS-grade shapes — keep points ≥ minMeters apart. */
function decimate(
  pts: { lng: number; lat: number }[],
  minMeters: number
): [number, number][] {
  const out: [number, number][] = [];
  let last: { lng: number; lat: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (
      last === null ||
      i === pts.length - 1 ||
      haversineMeters(last.lat, last.lng, p.lat, p.lng) >= minMeters
    ) {
      out.push([Number(p.lng.toFixed(4)), Number(p.lat.toFixed(4))]);
      last = p;
    }
  }
  return out;
}

/** MRT/LRT feeder buses: ride edges from schedules, headways from weekday departures. */
async function ingestFeeder(
  railStations: { id: string; lat: number; lng: number }[]
): Promise<FeederResult> {
  const read = await downloadGtfs(GTFS_FEEDER_URL);
  const routes = read("routes.txt");
  const stops = read("stops.txt");
  const trips = read("trips.txt");
  const stopTimes = read("stop_times.txt");
  const calendar = read("calendar.txt");
  const shapes = read("shapes.txt");

  const weekdayServices = new Set(
    calendar.filter((c) => c.monday === "1" && c.friday === "1").map((c) => c.service_id)
  );
  const tripById = new Map(trips.map((t) => [t.trip_id, t]));
  // T-numbers (T117…) are unique and human-readable — use them as route ids everywhere
  const shortByRouteId = new Map(
    routes.map((r) => [r.route_id, r.route_long_name || r.route_short_name || r.route_id])
  );

  const tripStops = new Map<string, { stop: string; arr: number; dep: number; seq: number }[]>();
  for (const st of stopTimes) {
    if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, []);
    tripStops.get(st.trip_id)!.push({
      stop: st.stop_id,
      arr: hmsToSecs(st.arrival_time),
      dep: hmsToSecs(st.departure_time),
      seq: Number(st.stop_sequence),
    });
  }
  for (const arr of tripStops.values()) arr.sort((a, b) => a.seq - b.seq);

  const edgeSecs = new Map<string, { total: number; n: number }>();
  const stopRoutes = new Map<string, Set<string>>();
  const firstDeps = new Map<string, number[]>(); // route -> first-stop weekday departures
  const headsignByRoute = new Map<string, string>();

  for (const [tripId, seq] of tripStops) {
    const trip = tripById.get(tripId);
    if (!trip || !weekdayServices.has(trip.service_id) || seq.length < 2) continue;
    const routeId = shortByRouteId.get(trip.route_id) ?? trip.route_id;
    if (trip.trip_headsign && !headsignByRoute.has(routeId)) {
      headsignByRoute.set(routeId, trip.trip_headsign);
    }
    for (const s of seq) {
      if (!stopRoutes.has(s.stop)) stopRoutes.set(s.stop, new Set());
      stopRoutes.get(s.stop)!.add(routeId);
    }
    if (trip.direction_id === "0") {
      if (!firstDeps.has(routeId)) firstDeps.set(routeId, []);
      firstDeps.get(routeId)!.push(seq[0].dep);
    }
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1];
      const secs = b.arr - a.dep;
      if (secs <= 0 || secs > 30 * 60) continue;
      const key = [a.stop, b.stop].sort().join("|");
      const e = edgeSecs.get(key) ?? { total: 0, n: 0 };
      e.total += secs;
      e.n += 1;
      edgeSecs.set(key, e);
    }
  }

  // Median gap between consecutive weekday departures, clamped to a sane band
  const busHeadways: Record<string, number> = {};
  for (const [routeId, deps] of firstDeps) {
    deps.sort((a, b) => a - b);
    const gaps = deps.slice(1).map((d, i) => d - deps[i]).filter((g) => g > 0);
    gaps.sort((a, b) => a - b);
    const medianSecs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 30 * 60;
    busHeadways[routeId] = Math.min(45, Math.max(5, Math.round(medianSecs / 60)));
  }

  const stopById = new Map(stops.map((s) => [s.stop_id, s]));
  const usedStops = [...stopRoutes.keys()]
    .map((stopId) => {
      const s = stopById.get(stopId);
      if (!s) return null;
      return {
        id: stopId,
        name: titleCase(s.stop_name),
        lat: Number(s.stop_lat),
        lng: Number(s.stop_lon),
        route: [...stopRoutes.get(stopId)!][0],
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const busEdges: [string, string, number, "ride" | "xfer"][] = [
    ...[...edgeSecs.entries()].map(([key, e]): [string, string, number, "ride"] => {
      const [a, b] = key.split("|");
      return [a, b, Math.round(e.total / e.n), "ride"];
    }),
  ];

  // Walking transfers: bus stop ↔ rail station
  for (const bs of usedStops) {
    for (const rs of railStations) {
      const d = haversineMeters(bs.lat, bs.lng, rs.lat, rs.lng);
      if (d > BUS_XFER_MAX_METERS) continue;
      const secs = Math.max(90, Math.round(d / TRANSFER_WALK_MPS + BUS_XFER_BUFFER_SECS));
      busEdges.push([bs.id, rs.id, secs, "xfer"]);
    }
  }

  // Shapes for map rendering (direction-0 weekday trip per route)
  const shapePoints = new Map<string, { lng: number; lat: number; seq: number }[]>();
  for (const p of shapes) {
    if (!shapePoints.has(p.shape_id)) shapePoints.set(p.shape_id, []);
    shapePoints.get(p.shape_id)!.push({
      lng: Number(p.shape_pt_lon),
      lat: Number(p.shape_pt_lat),
      seq: Number(p.shape_pt_sequence),
    });
  }
  for (const pts of shapePoints.values()) pts.sort((a, b) => a.seq - b.seq);

  const busLines = routes
    .map((r) => {
      const short = shortByRouteId.get(r.route_id)!;
      if (!firstDeps.has(short)) return null;
      const weekdayDir0 = trips.find(
        (t) =>
          t.route_id === r.route_id &&
          t.direction_id === "0" &&
          weekdayServices.has(t.service_id)
      );
      const shape = weekdayDir0 ? shapePoints.get(weekdayDir0.shape_id) ?? [] : [];
      return {
        id: short,
        shortName: short,
        name: `${short} · ${titleCase(headsignByRoute.get(short) ?? "Feeder bus")}`,
        color: BUS_COLOR,
        category: "BUS",
        headwayMin: busHeadways[short] ?? 30,
        shape: decimate(shape, 25),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const busNodes: FeederResult["busNodes"] = Object.fromEntries(
    usedStops.map((s) => [
      s.id,
      { name: s.name, lat: s.lat, lng: s.lng, route: s.route, kind: "bus" as const },
    ])
  );

  const busStops = usedStops.map(
    (s): [number, number] => [Number(s.lng.toFixed(5)), Number(s.lat.toFixed(5))]
  );

  return { busLines, busStops, busNodes, busEdges, busHeadways };
}

async function main() {
  const read = await downloadGtfs(GTFS_URL);

  const routes = read("routes.txt").filter((r) => (r.status ?? "valid") === "valid");
  const stops = read("stops.txt").filter((r) => (r.status ?? "valid") === "valid");
  const trips = read("trips.txt");
  const stopTimes = read("stop_times.txt");
  const frequencies = read("frequencies.txt");
  const shapes = read("shapes.txt");

  const tripById = new Map(trips.map((t) => [t.trip_id, t]));

  // Prefer weekday service when picking representative trips
  const weekdayServices = new Set(["MonFri", "weekday", "MonThu"]);
  const isWeekdayTrip = (tripId: string) => {
    const t = tripById.get(tripId);
    return t ? weekdayServices.has(t.service_id) : false;
  };

  // trip_id -> ordered [stop_id, arrivalSecs, departureSecs]
  const tripStops = new Map<string, { stop: string; arr: number; dep: number; seq: number }[]>();
  for (const st of stopTimes) {
    if (!tripStops.has(st.trip_id)) tripStops.set(st.trip_id, []);
    tripStops.get(st.trip_id)!.push({
      stop: st.stop_id,
      arr: hmsToSecs(st.arrival_time),
      dep: hmsToSecs(st.departure_time),
      seq: Number(st.stop_sequence),
    });
  }
  for (const arr of tripStops.values()) arr.sort((a, b) => a.seq - b.seq);

  // Ride edges: consecutive-stop scheduled seconds, averaged across directions
  const edgeSecs = new Map<string, { total: number; n: number }>();
  const stopRoutes = new Map<string, Set<string>>(); // stop_id -> route_ids (from actual trips)
  const routeStopSeq = new Map<string, string[]>(); // route_id -> ordered stops (dir 0 weekday)

  for (const [tripId, seq] of tripStops) {
    const trip = tripById.get(tripId);
    if (!trip || !isWeekdayTrip(tripId)) continue;
    const routeId = trip.route_id;
    for (const s of seq) {
      if (!stopRoutes.has(s.stop)) stopRoutes.set(s.stop, new Set());
      stopRoutes.get(s.stop)!.add(routeId);
    }
    if (trip.direction_id === "0" && !routeStopSeq.has(routeId)) {
      routeStopSeq.set(routeId, seq.map((s) => s.stop));
    }
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1];
      const secs = b.arr - a.dep;
      if (secs <= 0 || secs > 30 * 60) continue;
      const key = [a.stop, b.stop].sort().join("|");
      const e = edgeSecs.get(key) ?? { total: 0, n: 0 };
      e.total += secs;
      e.n += 1;
      edgeSecs.set(key, e);
    }
  }

  // Headway per route: time-weighted average over weekday frequency bands
  const headwayByRoute = new Map<string, number>();
  {
    const acc = new Map<string, { weighted: number; span: number }>();
    for (const f of frequencies) {
      const trip = tripById.get(f.trip_id);
      if (!trip || !isWeekdayTrip(f.trip_id)) continue;
      const span = hmsToSecs(f.end_time) - hmsToSecs(f.start_time);
      if (span <= 0) continue;
      const a = acc.get(trip.route_id) ?? { weighted: 0, span: 0 };
      a.weighted += Number(f.headway_secs) * span;
      a.span += span;
      acc.set(trip.route_id, a);
    }
    for (const [route, a] of acc) headwayByRoute.set(route, Math.round(a.weighted / a.span / 60));
  }

  // Shapes: pick the direction-0 weekday trip's shape per route
  const shapePoints = new Map<string, { lng: number; lat: number; seq: number }[]>();
  for (const p of shapes) {
    if (!shapePoints.has(p.shape_id)) shapePoints.set(p.shape_id, []);
    shapePoints.get(p.shape_id)!.push({
      lng: Number(p.shape_pt_lon),
      lat: Number(p.shape_pt_lat),
      seq: Number(p.shape_pt_sequence),
    });
  }
  for (const pts of shapePoints.values()) pts.sort((a, b) => a.seq - b.seq);

  const stopById = new Map(stops.map((s) => [s.stop_id, s]));

  const lines = routes.map((r) => {
    const weekdayDir0 = trips.find(
      (t) => t.route_id === r.route_id && t.direction_id === "0" && weekdayServices.has(t.service_id)
    );
    const shape = weekdayDir0 ? shapePoints.get(weekdayDir0.shape_id) ?? [] : [];
    return {
      id: r.route_id,
      shortName: r.route_short_name,
      name: r.route_long_name,
      color: `#${r.route_color}`,
      category: r.category,
      headwayMin: headwayByRoute.get(r.route_id) ?? 5,
      shape: shape.map((p) => [Number(p.lng.toFixed(5)), Number(p.lat.toFixed(5))]),
    };
  });

  const stations = [...stopRoutes.keys()]
    .map((stopId) => {
      const s = stopById.get(stopId);
      if (!s) return null;
      return {
        id: stopId,
        name: titleCase(s.stop_name),
        lat: Number(s.stop_lat),
        lng: Number(s.stop_lon),
        route: [...stopRoutes.get(stopId)!][0],
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // Transfer edges: stations of different routes within walking distance
  const transferEdges: [string, string, number][] = [];
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i], b = stations[j];
      if (a.route === b.route) continue;
      const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (d > TRANSFER_MAX_METERS) continue;
      const secs = Math.max(120, Math.round(d / TRANSFER_WALK_MPS + TRANSFER_BUFFER_SECS));
      transferEdges.push([a.id, b.id, secs]);
    }
  }

  const rideEdges: [string, string, number][] = [...edgeSecs.entries()].map(([key, e]) => {
    const [a, b] = key.split("|");
    return [a, b, Math.round(e.total / e.n)];
  });

  // Feeder buses are additive: if their feed is down, ship rail-only data.
  let feeder: FeederResult = {
    busLines: [],
    busStops: [],
    busNodes: {},
    busEdges: [],
    busHeadways: {},
  };
  try {
    feeder = await ingestFeeder(stations);
  } catch (e) {
    console.warn(`Feeder ingest failed — continuing rail-only: ${e}`);
  }

  const graph = {
    generatedAt: new Date().toISOString(),
    headwayMinByRoute: { ...Object.fromEntries(headwayByRoute), ...feeder.busHeadways },
    nodes: {
      ...Object.fromEntries(
        stations.map((s) => [s.id, { name: s.name, lat: s.lat, lng: s.lng, route: s.route }])
      ),
      ...feeder.busNodes,
    },
    edges: [
      ...rideEdges.map(([a, b, s]) => [a, b, s, "ride"]),
      ...transferEdges.map(([a, b, s]) => [a, b, s, "xfer"]),
      ...feeder.busEdges,
    ],
  };

  const rail = {
    generatedAt: new Date().toISOString(),
    source: GTFS_URL,
    lines,
    stations,
    busLines: feeder.busLines,
    busStops: feeder.busStops,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "rail.json"), JSON.stringify(rail));
  writeFileSync(join(OUT_DIR, "rail-graph.json"), JSON.stringify(graph));

  console.log(`Lines: ${lines.length}`);
  for (const l of lines)
    console.log(
      `  ${l.shortName.padEnd(4)} ${l.name.padEnd(28)} ${l.color} headway ~${l.headwayMin}min, shape pts ${l.shape.length}`
    );
  console.log(`Stations: ${stations.length}`);
  console.log(`Ride edges: ${rideEdges.length}, transfer edges: ${transferEdges.length}`);
  console.log(
    `Feeder buses: ${feeder.busLines.length} routes, ${feeder.busStops.length} stops, ` +
      `${feeder.busEdges.length} edges`
  );
  const bu = stations.filter((s) => s.name.toLowerCase().includes("bandar utama"));
  console.log(`Bandar Utama stops: ${bu.map((s) => `${s.id} (${s.route})`).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
