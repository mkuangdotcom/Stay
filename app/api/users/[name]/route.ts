import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

// Owner-only: proxy.ts blocks guests from /api/users entirely.
export const dynamic = "force-dynamic";

/** Reset a user's password. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const username = decodeURIComponent(name).toLowerCase();
  const password = String((await req.json()).password ?? "");
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!(await db.getUserCreds(username))) {
    return NextResponse.json({ error: "No such user" }, { status: 404 });
  }
  const salt = crypto.randomUUID();
  await db.updateUserPassword(username, salt, await hashPassword(password, salt));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  await db.deleteUser(decodeURIComponent(name).toLowerCase());
  return NextResponse.json({ ok: true });
}
