/** Session cookie value derived from the site password (Web Crypto — edge-safe). */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`stay-session:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
