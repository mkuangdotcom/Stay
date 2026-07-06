/**
 * Scraper configuration. Areas are iBilik location paths under
 * https://www.ibilik.com/locations/malaysia/<area>/room-rentals
 * Focused on corridors along the rail lines that reach Bandar Utama.
 */
export const IBILIK_AREAS = [
  "selangor/petaling-jaya",
  "selangor/bandar-utama",
  "kuala-lumpur/ttdi",
  "kuala-lumpur/damansara-heights",
  "kuala-lumpur/bangsar",
  "kuala-lumpur/kl-city-centre",
  "kuala-lumpur/pasar-seni",
  "kuala-lumpur/titiwangsa",
  "kuala-lumpur/sentul",
  "kuala-lumpur/jalan-ipoh",
  "kuala-lumpur/kepong",
  "kuala-lumpur/segambut",
  "kuala-lumpur/cheras",
  "kuala-lumpur/kuchai-lama",
  "kuala-lumpur/wangsa-maju",
];

/**
 * mudah.my paths (rooms: 40 ads/page; apartments: 15/page). Coordinates are
 * area-centroids — see scripts/adapters/mudah.ts. The roommate_gender_id
 * variants re-list the same ads filtered by Tenant Preference, which is how
 * gender restrictions are learned without any detail-page fetches — keep the
 * unfiltered path FIRST so the filtered passes only annotate.
 */
export const MUDAH_AREAS = [
  "kuala-lumpur/rooms-for-rent",
  "kuala-lumpur/rooms-for-rent?roommate_gender_id=2",
  "kuala-lumpur/rooms-for-rent?roommate_gender_id=1",
  "kuala-lumpur/apartments-condos-for-rent",
  "selangor/rooms-for-rent",
  "selangor/rooms-for-rent?roommate_gender_id=2",
  "selangor/rooms-for-rent?roommate_gender_id=1",
  "selangor/apartments-condos-for-rent",
];

/** SpeedHome region slugs under speedhome.com/rent/<region> (40/page, structured). */
export const SPEEDHOME_AREAS = ["kuala-lumpur", "petaling-jaya"];

/** Skip mudah listings whose area centroid is further than this from KL. */
export const MUDAH_MAX_KM_FROM_CENTER = 32;

/** Index pages fetched per area per run (15 listings each, newest first). */
export const MAX_PAGES_PER_AREA = 2;

/** Listings seen more recently than this many hours skip the detail re-fetch. */
export const DETAIL_REFRESH_HOURS = 20;

/** A listing missing from its source for this many days is marked inactive. */
export const STALE_AFTER_DAYS = 3;

/** Milliseconds between outbound requests (plus jitter). */
export const REQUEST_DELAY_MS = 1600;

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
