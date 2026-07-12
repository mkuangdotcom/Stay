import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhoneMY } from "@/lib/contact";

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
  if (patch.phone !== undefined) patch.phone = normalizePhoneMY(patch.phone);
  for (const k of ["lat", "lng"] as const) {
    if (patch[k] !== undefined && !Number.isFinite(Number(patch[k]))) delete patch[k];
    else if (patch[k] !== undefined) patch[k] = Number(patch[k]);
  }
  await db.updateListing(id, patch);
  // moved pin → cached walk times are wrong; drop them so commutes fall back to
  // estimates until the nightly scrape re-routes this listing
  if (patch.lat !== undefined || patch.lng !== undefined) await db.clearWalkEntries(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.deleteListing(id);
  return NextResponse.json({ ok: true });
}
