import { NextResponse } from "next/server";
import { getDailyProperty, dayKey } from "@/lib/game";
import { toClue } from "@/lib/types";

// Today's property with the price (and exact address) stripped out, so the
// answer never reaches the browser before the player guesses.
export async function GET() {
  try {
    const property = getDailyProperty();
    return NextResponse.json({ date: dayKey(), property: toClue(property) });
  } catch (err) {
    console.error("[/api/daily]", err);
    return NextResponse.json(
      { error: "Could not load today's property." },
      { status: 502 },
    );
  }
}
