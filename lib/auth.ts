/** Session cookie value derived from the site password (Web Crypto — edge-safe). */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`stay-session:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return hex(hash);
}

/* ----------------------- guest accounts ----------------------- */

const GUEST_MAX_AGE_SECS = 30 * 24 * 3600;

/** Salted password hash for stored guest credentials. */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return hex(await crypto.subtle.digest("SHA-256", data));
}

/** Signed guest cookie: `<username>.<issuedAtSecs>.<hmac>` (edge-verifiable, no DB). */
export async function signGuestToken(username: string, secret: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const sig = await hmac(`guest:${username}:${iat}`, secret);
  return `${username}.${iat}.${sig}`;
}

/** Returns the username when the token is authentic and not expired, else null. */
export async function verifyGuestToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, iatStr, sig] = parts;
  const iat = Number(iatStr);
  if (!username || !Number.isFinite(iat)) return null;
  if (Date.now() / 1000 - iat > GUEST_MAX_AGE_SECS) return null;
  const expected = await hmac(`guest:${username}:${iat}`, secret);
  return sig === expected ? username : null;
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`stay-guest:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
