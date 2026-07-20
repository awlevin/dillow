import { NextResponse } from "next/server";
import { getDailySlate, dayKey, priceCeiling, priceFloor } from "@/lib/game";
import { dailyLimitEnabled, getDailyOffset } from "@/lib/leaderboard";
import { roundPayload } from "@/lib/property-payload";
import { geoFromHeaders } from "@/lib/geo";

// Never cache — the home of the day can be rotated by an admin at any time, and
// the "local" home depends on the request's coarse location.
export const dynamic = "force-dynamic";
// A cold home may warm its gallery + details with one upstream request; three
// homes means up to three, so give it headroom beyond the default to avoid a 504.
export const maxDuration = 30;

// Today's three homes — the deterministic home of the day, a high-end "big
// spender" home, and one near the player (inferred from Vercel's IP geolocation,
// no prompt). Each clue has its price + exact address stripped out, so no answer
// reaches the browser before the player guesses. roundPayload warms the gallery +
// details and scrubs the price-revealing bits — the same builder rooms use, so
// every mode's clue (and its ⓘ details) is identical.
export async function GET(req: Request) {
  try {
    const date = dayKey();
    const coords = geoFromHeaders(req.headers);
    const slate = getDailySlate({ key: date, offset: await getDailyOffset(date), coords });

    const homes = await Promise.all(
      slate.map(async ({ slot, kind, property }) => {
        const { clue } = await roundPayload(property);
        return { slot, kind, propertyId: property.id, clue };
      }),
    );

    // priceFloor/priceCeiling are the slider's bounds — pool-wide, so they never
    // reveal any home's price (see lib/game).
    return NextResponse.json({
      date,
      homes,
      priceFloor: priceFloor(),
      priceCeiling: priceCeiling(),
      // Whether the player may keep playing bonus homes past the slate.
      unlimited: !(await dailyLimitEnabled()),
    });
  } catch (err) {
    console.error("[/api/daily]", err);
    return NextResponse.json({ error: "Could not load today's homes." }, { status: 502 });
  }
}
