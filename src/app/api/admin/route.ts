import { NextResponse } from "next/server";
import { dayKey, getDailyProperty, getPremiumProperty } from "@/lib/game";
import type { Property } from "@/lib/types";
import { fetchDetails } from "@/lib/providers/realtor16";
import {
  getDailyOffset,
  bumpDailyOffset,
  clearDailyState,
  getGallery,
  saveGallery,
  saveDetails,
  leaderboardEnabled,
} from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
// Enrich/rotate make an upstream realtor16 request that can be slow; give it
// headroom beyond the default so a slow gallery fetch doesn't 504 with an empty
// body (which surfaces to the client as "Unexpected end of JSON input").
export const maxDuration = 30;

// Set ADMIN_PASSWORD to override; defaults to the value Aaron chose.
const PASSWORD = process.env.ADMIN_PASSWORD ?? "8228";

function summary(p: Property, photos: string[]) {
  return {
    city: p.city,
    state: p.state,
    price: p.price,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    photos: photos.length,
    photo: photos[0] ?? null,
  };
}

// Effective photos = the cached runtime gallery if richer, else snapshot photos.
async function effectivePhotos(p: Property): Promise<string[]> {
  const g = await getGallery(p.id);
  return g && g.length > p.photos.length ? g : p.photos;
}

// Fetch + cache a full gallery AND the rich details from one realtor16 request.
// No-op for the gallery if already rich or the quota is exhausted (fetchDetails
// returns null on a non-OK response). Details are cached whenever present so the
// daily route never has to spend a second request to warm them.
async function enrich(p: Property): Promise<string[]> {
  const current = await effectivePhotos(p);
  if (current.length > 3) return current; // already rich
  const det = await fetchDetails(p.id);
  if (!det) return current;
  if (det.details) await saveDetails(p.id, det.details);
  if (det.photos.length > current.length) {
    await saveGallery(p.id, det.photos);
    return det.photos;
  }
  return current;
}

export async function POST(req: Request) {
  let body: { password?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.password !== "string" || body.password !== PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const date = dayKey();

  // Always return JSON, even on failure: an unhandled throw (slow/failed
  // realtor16 fetch, Redis blip) would otherwise return an empty body and the
  // client's res.json() would throw "Unexpected end of JSON input".
  try {
    if (body.action === "verify") {
      const property = getDailyProperty(date, await getDailyOffset(date));
      return NextResponse.json({ ok: true, current: summary(property, await effectivePhotos(property)) });
    }

    if (body.action === "enrich") {
      const offset = await getDailyOffset(date);
      const property = getDailyProperty(date, offset);
      const photos = await enrich(property);
      // Also pre-warm the day's "big spender" home (global, like the standard one)
      // so its gallery + details are hot before anyone reaches it. Best-effort.
      const premium = getPremiumProperty(date, new Set([property.id]));
      if (premium) await enrich(premium).catch(() => {});
      return NextResponse.json({ ok: true, current: summary(property, photos) });
    }

    if (body.action === "rotate") {
      if (!leaderboardEnabled()) {
        return NextResponse.json({ error: "Redis not configured — cannot rotate." }, { status: 503 });
      }
      const offset = await bumpDailyOffset(date);
      const cleared = await clearDailyState(date);
      const property = getDailyProperty(date, offset);
      const photos = await enrich(property); // give the new property a full gallery
      return NextResponse.json({ ok: true, rotated: true, offset, cleared, current: summary(property, photos) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(`[admin] ${String(body.action)} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
