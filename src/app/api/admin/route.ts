import { NextResponse } from "next/server";
import { dayKey, getDailyProperty } from "@/lib/game";
import type { Property } from "@/lib/types";
import {
  getDailyOffset,
  bumpDailyOffset,
  clearDailyState,
  leaderboardEnabled,
} from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

// Set ADMIN_PASSWORD to override; defaults to the value Aaron chose.
const PASSWORD = process.env.ADMIN_PASSWORD ?? "8228";

function summary(p: Property) {
  return {
    city: p.city,
    state: p.state,
    price: p.price,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    photos: p.photos.length,
    photo: p.photos[0] ?? null,
  };
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
    return NextResponse.json({ ok: true, current: summary(property) });
  }

  if (body.action === "rotate") {
    if (!leaderboardEnabled()) {
      return NextResponse.json({ error: "Redis not configured — cannot rotate." }, { status: 503 });
    }
    const offset = await bumpDailyOffset(date);
    const cleared = await clearDailyState(date);
    const property = getDailyProperty(date, offset);
    return NextResponse.json({ ok: true, rotated: true, offset, cleared, current: summary(property) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
