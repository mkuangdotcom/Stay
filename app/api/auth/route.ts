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
  const { username, password } = await req.json();
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.json({ ok: true });

  // owner: password only
  if (!username) {
    if (password !== expected) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
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

  // guest: username + their own password
  const creds = await db.getUserCreds(String(username).toLowerCase().trim());
  if (!creds || (await hashPassword(String(password), creds.salt)) !== creds.hash) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, role: "guest" });
  res.cookies.set(
    "stay_guest",
    await signGuestToken(String(username).toLowerCase().trim(), expected),
    { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 30 }
  );
  res.cookies.set("stay_role", "guest", {
    ...COOKIE_OPTS,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
