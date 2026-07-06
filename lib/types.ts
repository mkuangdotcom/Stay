export type Source = "ibilik" | "mudah" | "speedhome" | "facebook" | "manual";

export type RoomType = "master" | "medium" | "small" | "studio" | "unit" | "unknown";

/** Stated tenant restriction; null = no restriction stated. */
export type Gender = "female" | "male";

export interface Listing {
  id: string;
  source: Source;
  sourceId: string;
  url: string | null;
  title: string;
  priceRm: number;
  roomType: RoomType;
  propertyName: string | null;
  area: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photos: string[];
  furnished: string | null;
  availableFrom: string | null;
  /** tenant restriction stated by the lister (null = anyone) */
  gender: Gender | null;
  /** minimum tenancy in months (1 = short-term ok, null = not stated) */
  minTermMonths: number | null;
  notes: string | null;
  firstSeen: string;
  lastSeen: string;
  isActive: boolean;
  /** user shortlist star (synced via DB; optional so scrapers never touch it) */
  isFav?: boolean;
}

/** Precomputed walking times from a listing to its nearby stations. */
export interface WalkEntry {
  stationId: string;
  walkMin: number;
  meters: number;
  /** true when the value came from real OSRM foot routing, false = haversine estimate */
  routed: boolean;
}

export type WalkCache = Record<string, WalkEntry[]>;

export interface PricePoint {
  listingId: string;
  priceRm: number;
  seenAt: string;
}

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  master: "Master room",
  medium: "Medium room",
  small: "Small room",
  studio: "Studio",
  unit: "Whole unit",
  unknown: "Room",
};

export const SOURCE_LABELS: Record<Source, string> = {
  ibilik: "iBilik",
  mudah: "Mudah",
  speedhome: "SpeedHome",
  facebook: "Facebook",
  manual: "Manual",
};
