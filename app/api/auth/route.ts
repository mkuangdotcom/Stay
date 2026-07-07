import { NextRequest, NextResponse } from "next/server";
import { hashPassword, sessionToken, signGuestToken } from "@/lib/auth";
import { db } from "@/lib/db";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Sign out: clear both session cookies. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("stay_session", "", { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set("stay_guest", "", { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set("stay_role", "", { ...COOKIE_OPTS, httpOnly: false, maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = String(body.username ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.json({ ok: true });
  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  // the admin account — full access incl. /admin and user management
  const adminUser = (process.env.ADMIN_USERNAME ?? "mkuangdotcom").toLowerCase();
  if (username === adminUser) {
    if (password !== expected) {
      return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, role: "owner" });
    res.cookies.set("stay_session", await sessionToken(expected), {
      ...COOKIE_OPTS,
      maxAge: 60 * 60 * 24 * 90,
    });
    // readable by the client so the UI can adapt (not a security boundary)
    res.cookies.set("stay_role", "owner", {
      ...COOKIE_OPTS,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 90,
    });
    return res;
  }

  // regular account created by the admin — no admin privileges
  const creds = await db.getUserCreds(username);
  if (!creds || (await hashPassword(password, creds.salt)) !== creds.hash) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, role: "guest" });
  res.cookies.set("stay_guest", await signGuestToken(username, expected), {
    ...COOKIE_OPTS,
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set("stay_role", "guest", {
    ...COOKIE_OPTS,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
