/**
 * Real walking routes via the FOSSGIS OSRM foot-routing instance
 * (the public server behind openstreetmap.org's directions; fair-use).
 * Falls back to null on any failure — callers keep the haversine estimate.
 */
const OSRM_BASE = process.env.OSRM_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;

export async function walkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ meters: number; minutes: number } | null> {
  const wait = lastCallAt + 1100 - Date.now(); // ≤1 req/s, per fair-use policy
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  const url = `${OSRM_BASE}/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false&steps=false`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "stay-personal-rent-map/0.1" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: { distance: number; duration: number }[];
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) return null;
    return { meters: route.distance, minutes: route.duration / 60 };
  } catch {
    return null;
  }
}
