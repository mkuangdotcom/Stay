import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Listing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const [listings, walkCache] = await Promise.all([db.listListings(), db.getWalkCache()]);
  return NextResponse.json({ listings, walkCache });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = new Date().toISOString();
  const id = `manual_${crypto.randomUUID().slice(0, 8)}`;
  const listing: Listing = {
    id,
    source: body.source ?? "manual",
    sourceId: id,
    url: body.url || null,
    title: body.title || "Untitled listing",
    priceRm: Number(body.priceRm) || 0,
    roomType: body.roomType ?? "unknown",
    propertyName: body.propertyName || null,
    area: body.area || null,
    address: body.address || null,
    lat: Number(body.lat),
    lng: Number(body.lng),
    photos: Array.isArray(body.photos) ? body.photos : [],
    furnished: body.furnished || null,
    availableFrom: body.availableFrom || null,
    notes: body.notes || null,
    firstSeen: now,
    lastSeen: now,
    isActive: true,
  };
  if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) {
    return NextResponse.json({ error: "A map location is required" }, { status: 400 });
  }
  await db.createListing(listing);
  return NextResponse.json({ listing }, { status: 201 });
}
