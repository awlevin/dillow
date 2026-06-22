import { NextResponse } from "next/server";
import { getDailyProperty, dayKey } from "@/lib/game";
import { getDailyOffset } from "@/lib/leaderboard";
import { toClue } from "@/lib/types";

// Never cache — the property of the day can be rotated by an admin at any time.
export const dynamic = "force-dynamic";

// Today's property with the price (and exact address) stripped out, so the
// answer never reaches the browser before the player guesses.
export async function GET() {
  try {
    const date = dayKey();
    const property = getDailyProperty(date, await getDailyOffset(date));
    return NextResponse.json({ date, property: toClue(property) });
  } catch (err) {
    console.error("[/api/daily]", err);
    return NextResponse.json(
      { error: "Could not load today's property." },
      { status: 502 },
    );
  }
}
