/**
 * Best-effort extraction of tenant restrictions and minimum tenancy from
 * free-text listing titles/descriptions (Malay + English patterns).
 * Sources with structured fields (SpeedHome) skip this.
 */
import type { Gender } from "../../lib/types";

export function extractGender(text: string): Gender | null {
  const t = text.toLowerCase();
  const female = /(female|perempuan|wanita|\bgirls?\b|\bladies\b|\blady\b)/.test(t);
  const male = /(?<!fe)(\bmales?\b|lelaki|\bboys?\b)/.test(t);
  if (female && !male) return "female";
  if (male && !female) return "male";
  return null; // both or neither mentioned → no clear restriction
}

export function extractMinTerm(text: string): number | null {
  const t = text.toLowerCase();
  if (/short[\s-]?term|daily|weekly|no contract|flexible\s+(stay|term|lease)|harian|mingguan/.test(t)) {
    return 1;
  }
  const min = t.match(
    /min(?:imum)?\.?\s*(?:stay|contract|tenancy|rental|lease)?\s*(?:of\s*)?(\d{1,2})\s*(?:months?|bulan|mos?\b)/
  );
  if (min) return clamp(Number(min[1]));
  const before = t.match(
    /(\d{1,2})\s*(?:months?|bulan)\s*(?:minimum|min\b|contract|lease|tenancy)/
  );
  if (before) return clamp(Number(before[1]));
  if (/(?:\b1|one)\s*year\s*(?:contract|lease|tenancy|minimum|min\b)|setahun\s*kontrak/.test(t)) {
    return 12;
  }
  return null;
}

const clamp = (n: number) => (n >= 1 && n <= 36 ? n : null);
