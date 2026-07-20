import { NextResponse } from "next/server";
import { dayKey, getLocalQueue, listCities, priceCeiling, priceFloor } from "@/lib/game";
import { roundPayload } from "@/lib/property-payload";

export const dynamic = "force-dynamic";
// A cold local home may warm its gallery + details with one upstream request;
// give it headroom beyond the default so that fetch doesn't 504.
export const maxDuration = 30;

const MAX_BATCH = 10;

// Endless "Local mode": homes near the player, paged like the bonus queue but
// anchored to their nearest city (see getLocalQueue). `?cities=1` returns just the
// picker list — cheap, no warming. Otherwise `lat`/`lon` anchor the queue, `start`
// pages through it, `count` sizes the batch, and `exclude` names ids already served
// (a reload replays the same request and gets the same homes, which re-attaches
// saved progress). Too far from any pool city → { tooFar, cities } so the client can
// drop to the picker in one round trip. Prices are scrubbed the same way /api/daily
// scrubs them. NOT gated by the daily limit — Local mode is always available.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("cities") === "1") {
      return NextResponse.json({ cities: listCities() });
    }

    const latRaw = url.searchParams.get("lat");
    const lonRaw = url.searchParams.get("lon");
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!latRaw || !lonRaw || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "lat and lon are required." }, { status: 400 });
    }
    const start = Math.max(0, Number(url.searchParams.get("start")) || 0);
    const count = Math.min(MAX_BATCH, Math.max(1, Number(url.searchParams.get("count")) || 1));
    const exclude = new Set((url.searchParams.get("exclude") ?? "").split(",").filter(Boolean));

    const date = dayKey();
    const { city, homes, total } = getLocalQueue(date, lat, lon, start, count, exclude);
    if (!city) {
      // Nobody nearby — hand back the picker so the client falls back in one trip.
      return NextResponse.json({ tooFar: true, cities: listCities() });
    }

    const payload = await Promise.all(
      homes.map(async (property, i) => {
        const { clue } = await roundPayload(property);
        return { slot: start + i, kind: "local" as const, propertyId: property.id, clue };
      }),
    );
    // priceFloor/priceCeiling are the slider's pool-wide bounds (see lib/game) —
    // served here so Local mode doesn't have to touch /api/daily for them.
    return NextResponse.json({
      date,
      city,
      homes: payload,
      total,
      priceFloor: priceFloor(),
      priceCeiling: priceCeiling(),
    });
  } catch (err) {
    console.error("[/api/local]", err);
    return NextResponse.json({ error: "Could not load local homes." }, { status: 502 });
  }
}
