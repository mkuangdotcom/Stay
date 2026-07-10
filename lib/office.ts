/** Commute destination defaults, shared by the map and the tracker page. */
export const DEFAULT_OFFICE = { lat: 3.1458775, lng: 101.6173708 }; // First Avenue, Bandar Utama
export const OFFICE_KEY = "stay.office";
export const BUS_KEY = "stay.buses";

/** The saved destination pin, or the default when none is stored. */
export function readOffice(): { lat: number; lng: number } {
  try {
    const saved = localStorage.getItem(OFFICE_KEY);
    if (saved) {
      const { lat, lng } = JSON.parse(saved);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch {}
  return DEFAULT_OFFICE;
}
