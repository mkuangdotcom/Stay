import { NextRequest, NextResponse } from "next/server";
import { sessionToken } from "@/lib/auth";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("stay_session", "", { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = String(body.username ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.json({ ok: true });

  const adminUser = (process.env.ADMIN_USERNAME ?? "mkuangdotcom").toLowerCase();
  if (username !== adminUser || password !== expected) {
    return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("stay_session", await sessionToken(expected), {
    ...COOKIE_OPTS,
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
