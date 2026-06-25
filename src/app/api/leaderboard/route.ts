import { NextResponse } from "next/server";
import { getDailyProperty, isPastDate, dayKey, finalScore } from "@/lib/game";
import {
  leaderboardEnabled,
  topEntries,
  dayCount,
  playerStanding,
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

// Live leaderboard: today's standings by default (top 5 + the caller's own
// placement). Pass ?id= to get where that player ranks globally, even outside
// the top 5. The answer (property + price) is only revealed for PAST days, so
// today's board never spoils the game in progress.
export async function GET(req: Request) {
  if (!leaderboardEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? dayKey();
  const id = url.searchParams.get("id");
  const past = isPastDate(date);

  try {
    const [top, count, me] = await Promise.all([
      topEntries(date, 5),
      dayCount(date),
      id ? playerStanding(date, id) : Promise.resolve(null),
    ]);
    // Only reveal the answer once the day is over.
    const property = past ? getDailyProperty(date, await getDailyOffset(date)) : undefined;
    return NextResponse.json({ enabled: true, today: !past, date, property, top, count, me });
  } catch (err) {
    console.error("[/api/leaderboard]", err);
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 502 });
  }
}
