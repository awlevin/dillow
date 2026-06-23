import { NextResponse } from "next/server";
import { getDailyProperty, dayKeyOffset } from "@/lib/game";
import { getDailyOffset } from "@/lib/leaderboard";

// Never cache — an admin can rotate tomorrow's property at any time.
export const dynamic = "force-dynamic";

// A teaser for tomorrow's listing: just the city/state, never the price or
// address. Lets today's finished players see where the next home will be.
export async function GET() {
  try {
    const date = dayKeyOffset(1);
    const property = getDailyProperty(date, await getDailyOffset(date));
    return NextResponse.json({ date, city: property.city, state: property.state });
  } catch (err) {
    console.error("[/api/tomorrow]", err);
    return NextResponse.json({ error: "Could not load tomorrow's property." }, { status: 502 });
  }
}
