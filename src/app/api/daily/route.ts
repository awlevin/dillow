import { NextResponse } from "next/server";
import { getDailyProperty, dayKey, priceCeiling, priceFloor } from "@/lib/game";
import { getDailyOffset, getGallery, getDetails, saveGallery, saveDetails, leaderboardEnabled } from "@/lib/leaderboard";
import { fetchDetails } from "@/lib/providers/realtor16";
import { scrubDetails } from "@/lib/property-details";
import { toClue } from "@/lib/types";

// The committed snapshot is realtor16-baked, so its galleries + details come from
// realtor16 regardless of the runtime PROPERTY_PROVIDER (same reason the admin
// gallery warm imports realtor16 directly). Skip the warm when the key is absent
// — e.g. a snapshot-only production — so the hot path never throws a 502; the
// details modal simply won't appear until the key is configured.
const REALTOR_KEY = process.env.REALTOR_16_RAPID_API_KEY ?? process.env.REALTOR_16_API_KEY;

// Never cache — the property of the day can be rotated by an admin at any time.
export const dynamic = "force-dynamic";
// A cold day may warm the gallery + details with one upstream request; give it
// headroom beyond the default so a slow fetch doesn't 504 with an empty body.
export const maxDuration = 30;

// Today's property with the price (and exact address) stripped out, so the
// answer never reaches the browser before the player guesses.
export async function GET() {
  try {
    const date = dayKey();
    const property = getDailyProperty(date, await getDailyOffset(date));

    // Prefer the runtime-enriched gallery + rich details when available. On the
    // first view of a new day they may be missing; warm BOTH from a single
    // upstream request (Redis caches the result, so it's at most one request per
    // distinct daily home — the same cost the gallery alone used to incur). Only
    // attempt this when Redis is configured, so the fetch is actually cached.
    let gallery = await getGallery(property.id);
    let details = await getDetails(property.id);
    if (REALTOR_KEY && leaderboardEnabled() && (details === null || gallery === null)) {
      const det = await fetchDetails(property.id);
      if (det) {
        if (det.photos.length > property.photos.length) {
          await saveGallery(property.id, det.photos);
          gallery = det.photos;
        }
        if (det.details) {
          await saveDetails(property.id, det.details);
          details = det.details;
        }
      }
    }

    const enriched = gallery && gallery.length > property.photos.length ? { ...property, photos: gallery } : property;
    const clue = toClue(enriched);
    // priceFloor/priceCeiling are the slider's bounds — pool-wide, so they
    // never reveal today's price (see lib/game). Details are scrubbed of any
    // price-revealing fields before they reach the browser pre-guess.
    return NextResponse.json({
      date,
      property: details ? { ...clue, details: scrubDetails(details) } : clue,
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
