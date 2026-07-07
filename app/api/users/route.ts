import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

// Owner-only: proxy.ts blocks guests from /api/users entirely.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ users: await db.listUsers() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const username = String(body.username ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  if (!/^[a-z0-9_-]{3,24}$/.test(username)) {
    return NextResponse.json(
      { error: "Username: 3–24 chars, letters/numbers/dash/underscore" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (username === (process.env.ADMIN_USERNAME ?? "mkuangdotcom").toLowerCase()) {
    return NextResponse.json({ error: "That username is reserved" }, { status: 400 });
  }
  if (await db.getUserCreds(username)) {
    return NextResponse.json({ error: "That username already exists" }, { status: 409 });
  }
  const salt = crypto.randomUUID();
  await db.createUser(username, salt, await hashPassword(password, salt));
  return NextResponse.json({ ok: true }, { status: 201 });
}
