import { NextResponse } from "next/server";
import { getDailyProperty, isPastDate, dayKeyOffset, dayKey, finalScore } from "@/lib/game";
import {
  leaderboardEnabled,
  topEntries,
  dayCount,
  getDailyOffset,
  getGame,
  submitEntry,
} from "@/lib/leaderboard";

// Join today's leaderboard AFTER finishing the game, by name. Uses the player's
// stored game state (best guess, attempts) — they don't enter a name to play.
export async function POST(req: Request) {
  if (!leaderboardEnabled()) return NextResponse.json({ enabled: false });

  let body: { id?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  if (!id || !name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const date = dayKey();
  const state = await getGame(date, id);
  if (!state || !state.done) {
    return NextResponse.json({ error: "Finish today's game first." }, { status: 400 });
  }

  const score = finalScore(Math.max(state.bestScore, 0), state.attempts);
  const r = await submitEntry(date, {
    id,
    name,
    guess: state.bestGuess,
    score,
    pctError: state.bestPct,
    attempts: state.attempts,
  });
  return NextResponse.json({ rank: r.rank, count: r.count });
}

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
