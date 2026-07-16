/**
 * Continuous door-to-door travel-time surface. For each station (rail or bus
 * stop) the precomputed routing gives "seconds to destination once aboard";
 * walking radiates outward from there at the shared walk model (see
 * lib/geo.ts). Cells inherit the best (station + walk) total and keep their
 * exact minutes in `properties.m`, so the color ramp and the time slider are
 * both plain MapLibre expressions — slider moves never recompute the surface.
 *
 * Runs in the browser on every destination move — the station→cell stamping
 * is O(stations × cells-in-walk-radius) ≈ a few hundred thousand ops.
 */
import type { OfficeRouting, RailGraph } from "./railGraph";
import { DETOUR_FACTOR, haversineMeters, metersToWalkMinutes } from "./geo";

export const HEAT_MAX_MIN = 90; // surface ceiling == slider max
export const HEAT_MIN_MIN = 15; // slider min
export const HEAT_STEP_MIN = 5; // slider step

const CELL_DEG = 0.0025; // ~275 m
const MAX_ISO_WALK_MIN = 25; // nobody walks further than this to a station
const PAD_DEG = 0.03;
const MAX_GRID_CELLS = 250_000; // coarsen instead of choking on a huge bbox

export function travelTimeSurface(
  graph: RailGraph,
  routing: OfficeRouting,
  maxMinutes: number = HEAT_MAX_MIN
): GeoJSON.FeatureCollection {
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
    if (baseMin >= maxMinutes) continue;
    seeds.push({ lat: node.lat, lng: node.lng, baseMin });
    if (node.lat < minLat) minLat = node.lat;
    if (node.lat > maxLat) maxLat = node.lat;
    if (node.lng < minLng) minLng = node.lng;
    if (node.lng > maxLng) maxLng = node.lng;
  }
  minLat -= PAD_DEG; maxLat += PAD_DEG; minLng -= PAD_DEG; maxLng += PAD_DEG;

  let cellDeg = CELL_DEG;
  while (
    Math.ceil((maxLng - minLng) / cellDeg) * Math.ceil((maxLat - minLat) / cellDeg) >
    MAX_GRID_CELLS
  ) {
    cellDeg *= 2;
  }
  const cols = Math.ceil((maxLng - minLng) / cellDeg);

  const best = new Map<number, number>(); // cellIndex -> minutes
  const minutesPerCell = metersToWalkMinutes(cellDeg * 111_000 * DETOUR_FACTOR);
  for (const s of seeds) {
    const walkBudget = Math.min(maxMinutes - s.baseMin, MAX_ISO_WALK_MIN);
    if (walkBudget <= 0) continue;
    const r = Math.ceil(walkBudget / minutesPerCell);
    const ci = Math.floor((s.lng - minLng) / cellDeg);
    const cj = Math.floor((s.lat - minLat) / cellDeg);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= cols) continue;
        const cellLat = minLat + (j + 0.5) * cellDeg;
        const cellLng = minLng + (i + 0.5) * cellDeg;
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

  // Emit one rectangle per run of same-minute cells in a row (sorted keys are
  // row-major, so a run is just consecutive keys with equal quantized minutes).
  const keys = [...best.keys()].sort((a, b) => a - b);
  const features: GeoJSON.Feature[] = [];
  let runJ = -1, runStart = 0, runEnd = 0, runM = 0; // i-range [runStart, runEnd)
  const flush = () => {
    if (runJ < 0) return;
    const lat0 = minLat + runJ * cellDeg;
    const lng0 = minLng + runStart * cellDeg;
    const lng1 = minLng + runEnd * cellDeg;
    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[
          [lng0, lat0],
          [lng1, lat0],
          [lng1, lat0 + cellDeg],
          [lng0, lat0 + cellDeg],
          [lng0, lat0],
        ]],
      },
      properties: { m: runM },
    });
  };
  for (const key of keys) {
    const m = Math.max(1, Math.round(best.get(key)!));
    if (m > maxMinutes) continue;
    const i = key % cols;
    const j = (key - i) / cols;
    if (j === runJ && i === runEnd && m === runM) {
      runEnd++;
      continue;
    }
    flush();
    runJ = j; runStart = i; runEnd = i + 1; runM = m;
  }
  flush();
  return { type: "FeatureCollection", features };
}
