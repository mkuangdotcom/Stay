import { NextRequest, NextResponse } from "next/server";
import { sessionToken, verifyGuestToken } from "@/lib/auth";

/**
 * Whole-site password gate (free-tier replacement for Vercel's paid protection).
 * Set SITE_PASSWORD in the environment to enable; unset = open (local dev).
 *
 * Two tiers:
 *  - owner  (stay_session cookie, from SITE_PASSWORD) — everything
 *  - guest  (stay_guest signed cookie, accounts managed in /admin) — read-only:
 *    no /admin, no /api/users, no mutating API calls. Revocation is checked
 *    against the users table with a short cache, so it bites within a minute.
 */

const guestSeenOk = new Map<string, number>(); // username -> last confirmed ms
const GUEST_RECHECK_MS = 60_000;

async function guestStillExists(username: string): Promise<boolean> {
  const last = guestSeenOk.get(username);
  if (last && Date.now() - last < GUEST_RECHECK_MS) return true;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return true; // file-backend dev: no revocation store
  try {
    const res = await fetch(
      `${url}/rest/v1/users?username=eq.${encodeURIComponent(username)}&select=username`,
      { headers: { apikey: key, authorization: `Bearer ${key}` } }
    );
    const rows = (await res.json()) as unknown[];
    const ok = Array.isArray(rows) && rows.length > 0;
    if (ok) guestSeenOk.set(username, Date.now());
    else guestSeenOk.delete(username);
    return ok;
  } catch {
    return last !== undefined; // network hiccup: fall back to last known state
  }
}

export async function proxy(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const owner = req.cookies.get("stay_session")?.value;
  if (owner && owner === (await sessionToken(password))) {
    return NextResponse.next();
  }

  const guestCookie = req.cookies.get("stay_guest")?.value;
  if (guestCookie) {
    const username = await verifyGuestToken(guestCookie, password);
    if (username && (await guestStillExists(username))) {
      const path = req.nextUrl.pathname;
      const readOnlyViolation =
        path.startsWith("/admin") ||
        path.startsWith("/api/users") ||
        (path.startsWith("/api/") && req.method !== "GET");
      if (!readOnlyViolation) return NextResponse.next();
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Guest access is read-only" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // everything except the login flow and static assets
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|images).*)",
  ],
};
