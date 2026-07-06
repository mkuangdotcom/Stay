import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Owner-only: proxy.ts blocks guests from /api/users entirely.
export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  await db.deleteUser(decodeURIComponent(name).toLowerCase());
  return NextResponse.json({ ok: true });
}
