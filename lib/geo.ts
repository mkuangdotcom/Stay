/** Straight-line distance in meters. */
export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const DETOUR_FACTOR = 1.35; // street networks are never straight lines
const WALK_KMH = 4.6;

/** Estimated walking minutes between two points (haversine × detour factor). */
export function walkMinutesEstimate(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const meters = haversineMeters(aLat, aLng, bLat, bLng) * DETOUR_FACTOR;
  return meters / 1000 / (WALK_KMH / 60);
}

export function metersToWalkMinutes(routedMeters: number): number {
  return routedMeters / 1000 / (WALK_KMH / 60);
}
