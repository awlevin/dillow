import { NextResponse } from "next/server";
import { getDailyProperty, dayKey, priceCeiling, priceFloor } from "@/lib/game";
import { getDailyOffset } from "@/lib/leaderboard";
import { roundPayload } from "@/lib/property-payload";

// Never cache — the property of the day can be rotated by an admin at any time.
export const dynamic = "force-dynamic";
// A cold day may warm the gallery + details with one upstream request; give it
// headroom beyond the default so a slow fetch doesn't 504 with an empty body.
export const maxDuration = 30;

// Today's property with the price (and exact address) stripped out, so the
// answer never reaches the browser before the player guesses. roundPayload warms
// the gallery + details and scrubs the price-revealing bits — the same builder
// the rooms use, so the clue (and its ⓘ details) is identical across modes.
export async function GET() {
  try {
    const date = dayKey();
    const property = getDailyProperty(date, await getDailyOffset(date));
    const { clue } = await roundPayload(property);
    // priceFloor/priceCeiling are the slider's bounds — pool-wide, so they
    // never reveal today's price (see lib/game).
    return NextResponse.json({
      date,
      property: clue,
      priceFloor: priceFloor(),
      priceCeiling: priceCeiling(),
    });
  } catch (err) {
    console.error("[/api/daily]", err);
    return NextResponse.json(
      { error: "Could not load today's property." },
      { status: 502 },
    );
  }
}
