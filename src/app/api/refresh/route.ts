import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchPool } from "@/lib/providers";

// MANUAL refresh only. Each call spends ONE realtor16 request (you have ~30/mo),
// so this is never triggered automatically — you POST to it on purpose to pull a
// fresh batch of listings into the committed snapshot at src/data/pool.json.
//
// Guard: in production a token is required. Set REFRESH_TOKEN and call with
//   POST /api/refresh?token=YOUR_TOKEN
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (process.env.NODE_ENV === "production" && token !== process.env.REFRESH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = await fetchPool(); // ← the single API call (honors PROPERTY_PROVIDER)
    if (!pool.length) {
      return NextResponse.json(
        { error: "Provider returned no usable properties." },
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
