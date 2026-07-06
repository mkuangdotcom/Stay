import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const points = (await db.listPriceHistory())
    .filter((p) => p.listingId === id)
    .sort((a, b) => (a.seenAt < b.seenAt ? -1 : 1))
    .map((p) => ({ priceRm: p.priceRm, seenAt: p.seenAt }));
  return NextResponse.json({ points });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const patch = await req.json();
  delete patch.id;
  await db.updateListing(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.deleteListing(id);
  return NextResponse.json({ ok: true });
}
