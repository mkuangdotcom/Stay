import { NextRequest, NextResponse } from "next/server";

/** Nominatim proxy so the browser gets geocoding with a proper user-agent. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return NextResponse.json({ results: [] });
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "my");
  const res = await fetch(url, {
    headers: { "user-agent": "stay-personal-rent-map/0.1" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return NextResponse.json({ results: [] }, { status: 502 });
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return NextResponse.json({
    results: data.map((r) => ({
      name: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    })),
  });
}
