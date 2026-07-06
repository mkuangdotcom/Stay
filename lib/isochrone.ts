/**
 * Door-to-door commute zones. For each station (rail or bus stop) the
 * precomputed routing gives "seconds to destination once aboard"; walking
 * radiates outward from there at the shared walk model (see lib/geo.ts).
 * Cells inherit the best (station + walk) total, then get banded.
 *
 * Runs in the browser on every destination move — the station→cell stamping
 * is O(stations × cells-in-walk-radius) ≈ a few hundred thousand ops.
 */
import type { OfficeRouting, RailGraph } from "./railGraph";
import { DETOUR_FACTOR, haversineMeters, metersToWalkMinutes } from "./geo";

const CELL_DEG = 0.005; // ~550 m
const MAX_ISO_WALK_MIN = 25; // nobody walks further than this to a station
const PAD_DEG = 0.03;

export function isochroneCells(
  graph: RailGraph,
  routing: OfficeRouting,
  bands: number[] // ascending minutes, e.g. [30, 45, 60]
): GeoJSON.FeatureCollection {
  const maxBand = bands[bands.length - 1];

  // seeds: every routed node (+ the destination itself for pure walking)
  const seeds: { lat: number; lng: number; baseMin: number }[] = [
    { lat: routing.office.lat, lng: routing.office.lng, baseMin: 0 },
  ];
  let minLat = routing.office.lat, maxLat = routing.office.lat;
  let minLng = routing.office.lng, maxLng = routing.office.lng;
  for (const [id, node] of Object.entries(graph.nodes)) {
    const secs = routing.dist.get(id);
    if (secs === undefined) continue;
    const baseMin = secs / 60 + graph.headwayMin(node.route) / 2;
    if (baseMin >= maxBand) continue;
    seeds.push({ lat: node.lat, lng: node.lng, baseMin });
    if (node.lat < minLat) minLat = node.lat;
    if (node.lat > maxLat) maxLat = node.lat;
    if (node.lng < minLng) minLng = node.lng;
    if (node.lng > maxLng) maxLng = node.lng;
  }
  minLat -= PAD_DEG; maxLat += PAD_DEG; minLng -= PAD_DEG; maxLng += PAD_DEG;

  const cols = Math.ceil((maxLng - minLng) / CELL_DEG);
  const best = new Map<number, number>(); // cellIndex -> minutes

  const minutesPerCell = metersToWalkMinutes(CELL_DEG * 111_000 * DETOUR_FACTOR);
  for (const s of seeds) {
    const walkBudget = Math.min(maxBand - s.baseMin, MAX_ISO_WALK_MIN);
    if (walkBudget <= 0) continue;
    const r = Math.ceil(walkBudget / minutesPerCell);
    const ci = Math.floor((s.lng - minLng) / CELL_DEG);
    const cj = Math.floor((s.lat - minLat) / CELL_DEG);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= cols) continue;
        const cellLat = minLat + (j + 0.5) * CELL_DEG;
        const cellLng = minLng + (i + 0.5) * CELL_DEG;
        const walkMin = metersToWalkMinutes(
          haversineMeters(s.lat, s.lng, cellLat, cellLng) * DETOUR_FACTOR
        );
        if (walkMin > walkBudget) continue;
        const total = s.baseMin + walkMin;
        const key = j * cols + i;
        const cur = best.get(key);
        if (cur === undefined || total < cur) best.set(key, total);
      }
    }
  }

  const features: GeoJSON.Feature[] = [];
  for (const [key, minutes] of best) {
    const band = bands.find((b) => minutes <= b);
    if (band === undefined) continue;
    const i = key % cols;
    const j = (key - i) / cols;
    const lng0 = minLng + i * CELL_DEG;
    const lat0 = minLat + j * CELL_DEG;
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [lng0, lat0],
          [lng0 + CELL_DEG, lat0],
          [lng0 + CELL_DEG, lat0 + CELL_DEG],
          [lng0, lat0 + CELL_DEG],
          [lng0, lat0],
        ]],
      },
      properties: { band },
    });
  }
  return { type: "FeatureCollection", features };
}
