import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Outreach, OutreachChannel, OutreachStatus } from "@/lib/types";
import { OUTREACH_CHANNEL_LABELS, OUTREACH_STATUS_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const outreach = await db.listOutreach();
  return NextResponse.json({ outreach });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.listingId || typeof body.listingId !== "string") {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }
  if (!(body.status in OUTREACH_STATUS_LABELS)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const row: Outreach = {
    listingId: body.listingId,
    status: body.status as OutreachStatus,
    channel:
      body.channel && body.channel in OUTREACH_CHANNEL_LABELS
        ? (body.channel as OutreachChannel)
        : null,
    contactedAt: body.contactedAt || null,
    viewingAt: body.viewingAt || null,
    agreedRm: Number(body.agreedRm) > 0 ? Number(body.agreedRm) : null,
    utilities: body.utilities || null,
    commuteMinOverride:
      Number.isFinite(Number(body.commuteMinOverride)) && Number(body.commuteMinOverride) > 0
        ? Math.round(Number(body.commuteMinOverride))
        : null,
    notes: typeof body.notes === "string" ? body.notes : "",
    updatedAt: new Date().toISOString(),
  };
  await db.upsertOutreach(row);
  return NextResponse.json({ outreach: row });
}

export async function DELETE(req: NextRequest) {
  const listingId = req.nextUrl.searchParams.get("listingId");
  if (!listingId) {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }
  await db.deleteOutreach(listingId);
  return NextResponse.json({ ok: true });
}
