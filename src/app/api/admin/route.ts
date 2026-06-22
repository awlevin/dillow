import { NextResponse } from "next/server";
import { dayKey, getDailyProperty } from "@/lib/game";
import type { Property } from "@/lib/types";
import { fetchDetails } from "@/lib/providers/realtor16";
import {
  getDailyOffset,
  bumpDailyOffset,
  clearDailyState,
  getGallery,
  saveGallery,
  leaderboardEnabled,
} from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

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

// Fetch + cache a full gallery (1 realtor16 request). No-op if already rich or
// quota is exhausted (fetchDetails returns null on a non-OK response).
async function enrich(p: Property): Promise<string[]> {
  const current = await effectivePhotos(p);
  if (current.length > 3) return current; // already rich
  const det = await fetchDetails(p.id);
  if (det && det.photos.length > current.length) {
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

  if (body.action === "verify") {
    const property = getDailyProperty(date, await getDailyOffset(date));
    return NextResponse.json({ ok: true, current: summary(property, await effectivePhotos(property)) });
  }

  if (body.action === "enrich") {
    const property = getDailyProperty(date, await getDailyOffset(date));
    const photos = await enrich(property);
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
}
