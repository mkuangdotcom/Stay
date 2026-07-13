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
  /** lister's contact number, normalized to +60… (null = source doesn't publish one) */
  phone: string | null;
  /** lister/agent display name when the source provides one */
  contactName: string | null;
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

/* ------------------------------ outreach ------------------------------ */

export type OutreachStatus = "contacted" | "replied" | "viewing" | "contract" | "dead";

export type OutreachChannel = "whatsapp" | "phone" | "sms" | "portal" | "other";

/** One row per listing the user has reached out to (or queued). */
export interface Outreach {
  listingId: string;
  status: OutreachStatus;
  /** how first contact was made (portal = the source site's own chat) */
  channel: OutreachChannel | null;
  /** date first contacted (YYYY-MM-DD) */
  contactedAt: string | null;
  /** scheduled viewing/inspection (ISO datetime) */
  viewingAt: string | null;
  /** negotiated rent, when it differs from asking */
  agreedRm: number | null;
  /** free text: "wifi+water incl, electric metered" */
  utilities: string | null;
  /** manual door-to-door override in minutes (null = use the computed commute) */
  commuteMinOverride: number | null;
  /** why the lead died: "taken", "agent ghosted"… (only meaningful when status = dead) */
  deadReason: string | null;
  notes: string;
  updatedAt: string;
}

/** Blank record — spread under saved state + a patch when upserting. */
export function emptyOutreach(listingId: string): Outreach {
  return {
    listingId,
    status: "contacted",
    channel: null,
    contactedAt: null,
    viewingAt: null,
    agreedRm: null,
    utilities: null,
    commuteMinOverride: null,
    deadReason: null,
    notes: "",
    updatedAt: "",
  };
}

export const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  contacted: "Contacted",
  replied: "Replied",
  viewing: "Viewing booked",
  contract: "Contract",
  dead: "Dead",
};

/** quick-pick reasons offered when a lead is marked dead */
export const DEAD_REASON_PRESETS = [
  "Taken",
  "Too expensive",
  "Ghosted",
  "Bad location",
  "Bad condition",
] as const;

export const OUTREACH_CHANNEL_LABELS: Record<OutreachChannel, string> = {
  whatsapp: "WhatsApp",
  phone: "Call",
  sms: "SMS",
  portal: "Site chat",
  other: "Other",
};

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
