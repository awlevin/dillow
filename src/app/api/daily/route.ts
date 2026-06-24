import { NextResponse } from "next/server";
import { getDailyProperty, dayKey, priceCeiling } from "@/lib/game";
import { getDailyOffset, getGallery } from "@/lib/leaderboard";
import { toClue } from "@/lib/types";

// Never cache — the property of the day can be rotated by an admin at any time.
export const dynamic = "force-dynamic";

// Today's property with the price (and exact address) stripped out, so the
// answer never reaches the browser before the player guesses.
export async function GET() {
  try {
    const date = dayKey();
    const property = getDailyProperty(date, await getDailyOffset(date));
    // Prefer a runtime-enriched gallery (more/interior photos) when available.
    const gallery = await getGallery(property.id);
    const enriched = gallery && gallery.length > property.photos.length ? { ...property, photos: gallery } : property;
    // priceCeiling is the slider's top bound — pool-wide, so it never reveals
    // today's price (see priceCeiling in lib/game).
    return NextResponse.json({ date, property: toClue(enriched), priceCeiling: priceCeiling() });
  } catch (err) {
    console.error("[/api/daily]", err);
    return NextResponse.json(
      { error: "Could not load today's property." },
      { status: 502 },
    );
  }
}
