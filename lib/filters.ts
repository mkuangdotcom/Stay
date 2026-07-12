import type { Gender, Listing, Outreach, OutreachStatus, RoomType, Source } from "./types";
import type { Commute } from "./railGraph";

export interface FilterState {
  priceMin: number | null;
  priceMax: number | null;
  roomTypes: RoomType[]; // empty = all
  sources: Source[]; // empty = all
  maxWalkMin: number | null;
  maxCommuteMin: number | null;
  keyword: string;
  activeOnly: boolean;
  /** only listings first seen within the last N days (null = any time) */
  maxAgeDays: number | null;
  /** who is renting — hides listings restricted to the other gender */
  tenant: Gender | null;
  /** the longest commitment acceptable, in months (null = any) */
  maxTermMonths: number | null;
  /** only starred listings */
  favOnly: boolean;
  /** only listings in the tracker, at any stage */
  trackedOnly: boolean;
  /** only listings at these tracker stages (empty = don't filter by stage) */
  outreachStatuses: OutreachStatus[];
}

export const DEFAULT_FILTERS: FilterState = {
  priceMin: null,
  priceMax: null,
  roomTypes: [],
  sources: [],
  maxWalkMin: null,
  maxCommuteMin: null,
  keyword: "",
  activeOnly: true,
  maxAgeDays: null,
  tenant: null,
  maxTermMonths: null,
  favOnly: false,
  trackedOnly: false,
  outreachStatuses: [],
};

export function applyFilters(
  listings: Listing[],
  commutes: Map<string, Commute | null>,
  outreach: Record<string, Outreach>,
  f: FilterState
): Listing[] {
  const kw = f.keyword.trim().toLowerCase();
  const seenAfter =
    f.maxAgeDays !== null ? new Date(Date.now() - f.maxAgeDays * 864e5).toISOString() : null;
  return listings.filter((l) => {
    if (f.favOnly && !l.isFav) return false;
    const o = outreach[l.id];
    const trackerOn = f.trackedOnly || f.outreachStatuses.length > 0;
    if (trackerOn) {
      if (!o) return false;
      if (f.outreachStatuses.length && !f.outreachStatuses.includes(o.status)) return false;
    }
    // listings staged Dead only appear when the Dead stage chip is selected
    if (o?.status === "dead" && !f.outreachStatuses.includes("dead")) return false;
    // tracked listings stay visible even after the source ad disappears
    if (f.activeOnly && !l.isActive && !trackerOn) return false;
    if (seenAfter !== null && l.firstSeen < seenAfter) return false;
    if (f.priceMin !== null && l.priceRm < f.priceMin) return false;
    if (f.priceMax !== null && l.priceRm > f.priceMax) return false;
    if (f.roomTypes.length && !f.roomTypes.includes(l.roomType)) return false;
    if (f.sources.length && !f.sources.includes(l.source)) return false;
    if (f.tenant && l.gender && l.gender !== f.tenant) return false;
    if (f.maxTermMonths !== null && l.minTermMonths !== null && l.minTermMonths > f.maxTermMonths)
      return false;
    const c = commutes.get(l.id);
    if (f.maxWalkMin !== null && (!c || c.walkMin > f.maxWalkMin)) return false;
    if (f.maxCommuteMin !== null && (!c || c.totalMin > f.maxCommuteMin)) return false;
    if (kw) {
      const hay = `${l.title} ${l.propertyName ?? ""} ${l.area ?? ""} ${l.address ?? ""} ${l.notes ?? ""}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}
