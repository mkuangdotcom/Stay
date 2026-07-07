import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/auth";

/**
 * Whole-site password gate (free-tier replacement for Vercel's paid protection).
 * Set SITE_PASSWORD in the environment to enable; unset = open (local dev).
 * Single account: ADMIN_USERNAME + SITE_PASSWORD (see app/api/auth).
 */
export async function proxy(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get("stay_session")?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
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
