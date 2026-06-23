import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchPool, enrichPool } from "@/lib/providers";
import { MIN_PHOTOS } from "@/lib/game";

// MANUAL refresh only. A search spends one realtor16 request and enrichment
// spends one per listing, so this is never triggered automatically — you POST to
// it on purpose to rebuild the committed snapshot at src/data/pool.json.
//
// Each listing is enriched to its full gallery and any with fewer than
// MIN_PHOTOS photos is dropped, so the snapshot only ever contains properties
// that satisfy the minimum-photo guarantee.
//
// Guard: in production a token is required. Set REFRESH_TOKEN and call with
//   POST /api/refresh?token=YOUR_TOKEN
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (process.env.NODE_ENV === "production" && token !== process.env.REFRESH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await fetchPool(); // search (honors PROPERTY_PROVIDER)
    const enriched = await enrichPool(raw); // full galleries
    const pool = enriched.filter((p) => p.photos.length >= MIN_PHOTOS);
    if (!pool.length) {
      return NextResponse.json(
        { error: `No properties with at least ${MIN_PHOTOS} photos.` },
        { status: 502 },
      );
    }
    const dir = path.join(process.cwd(), "src", "data");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "pool.json"),
      JSON.stringify({ fetchedAt: new Date().toISOString(), properties: pool }, null, 2),
    );
    return NextResponse.json({
      count: pool.length,
      sample: pool.slice(0, 2).map((p) => ({ city: p.city, price: p.price, photos: p.photos.length })),
    });
  } catch (err) {
    console.error("[/api/refresh]", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
