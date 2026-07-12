/**
 * Contact helpers: Malaysian phone normalization, wa.me links, and the
 * pre-written outreach message. Pure — shared by the browser and the scraper.
 */
import type { Listing } from "./types";

/** Normalize to +60… ; returns null for anything that doesn't look like a phone. */
export function normalizePhoneMY(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0")) d = "60" + d.slice(1); // 012… → 6012…
  if (!/^\d{9,14}$/.test(d)) return null;
  return `+${d}`;
}

/**
 * First Malaysian mobile number found in free text (ad descriptions), normalized.
 * Mudah's apartments category omits the structured phone field but ~80% of those
 * ads write the number in the description.
 */
export function phoneFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(?<!\d)(?:\+?6\s?)?01\d(?:[\s-]?\d){7,8}(?!\d)/);
  return m ? normalizePhoneMY(m[0]) : null;
}

/** Display form: +60 12-345 6789 stays readable without being clever. */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+60(1\d{1,2})(\d{3,4})(\d{4})$/);
  return m ? `0${m[1]}-${m[2]} ${m[3]}` : phone;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export const TEMPLATE_KEY = "stay.msg-template";

export const DEFAULT_TEMPLATE = `Hi{name}, I saw your listing "{title}" ({price}/mo{area}) and I'm interested. Is it still available? I'd like to arrange a viewing.

{url}`;

/** Fill {name} {title} {price} {area} {url} from a listing; empty parts collapse cleanly. */
export function fillTemplate(template: string, l: Listing): string {
  return template
    .replaceAll("{name}", l.contactName ? ` ${l.contactName}` : "")
    .replaceAll("{title}", l.title)
    .replaceAll("{price}", `RM${l.priceRm.toLocaleString()}`)
    .replaceAll("{area}", l.area ? `, ${l.area}` : "")
    .replaceAll("{url}", l.url ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
