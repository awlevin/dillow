import { NextResponse } from "next/server";
import { getDailyProperty, isPastDate, dayKeyOffset } from "@/lib/game";
import { leaderboardEnabled, topEntries, dayCount, getDailyOffset } from "@/lib/leaderboard";

// Next-day reveal: returns the leaderboard + answer for a PAST day only. Today's
// board is intentionally withheld until the day rolls over (the suspense hook).
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? dayKeyOffset(-1);

  if (!leaderboardEnabled()) {
    return NextResponse.json({ enabled: false });
  }
  if (!isPastDate(date)) {
    return NextResponse.json(
      { enabled: true, revealed: false, message: "Results are revealed the next day." },
      { status: 200 },
    );
  }

  try {
    const property = getDailyProperty(date, await getDailyOffset(date)); // day is over
    const [top, count] = await Promise.all([topEntries(date, 10), dayCount(date)]);
    return NextResponse.json({ enabled: true, revealed: true, date, property, top, count });
  } catch (err) {
    console.error("[/api/leaderboard]", err);
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 502 });
  }
}
