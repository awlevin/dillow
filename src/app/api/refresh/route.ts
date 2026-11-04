import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchPool, enrichPool } from "@/lib/providers";
import { MIN_PHOTOS, isPlayable } from "@/lib/game";

// MANUAL refresh only. A search spends one realtor16 request and enrichment
// spends one per listing, so this is never triggered automatically — you POST to
// it on purpose to rebuild the snapshot at src/data/pool.json, then upload it
// with `npm run data:push` (the file is never committed — see scripts/data.mjs).
//
// Each listing is enriched to its full gallery, then dropped unless it carries
// every gameplay-critical field (>= MIN_PHOTOS photos, a price, and real
// sqft/beds/baths — see isPlayable), so the snapshot only ever contains homes
// that are complete enough to feature.
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
    const pool = enriched.filter(isPlayable);
    if (!pool.length) {
      return NextResponse.json(
        {
          error: `No properties complete enough to feature (need >= ${MIN_PHOTOS} photos plus price, sqft, beds, baths).`,
        },
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
