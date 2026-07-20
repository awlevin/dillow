import { NextResponse } from "next/server";
import { dayKey, getPropertyById, rankScore } from "@/lib/game";
import {
  leaderboardEnabled,
  topPropertyEntries,
  propertyBoardCount,
  propertyStanding,
  getGame,
  submitPropertyEntry,
} from "@/lib/leaderboard";
import { getRoom, getRoomGame } from "@/lib/room";

// Join a home's all-time leaderboard AFTER finishing it, by name. Uses the
// player's stored game state for that home (best guess, attempts) — they don't
// enter a name to play. Idempotent and best-score-wins, so re-joining is safe.
export async function POST(req: Request) {
  if (!leaderboardEnabled()) return NextResponse.json({ enabled: false });

  let body: { id?: unknown; name?: unknown; propertyId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  const propertyId = typeof body.propertyId === "string" ? body.propertyId : null;
  if (!id || !name || !propertyId) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const date = dayKey();
  const state = await getGame(date, propertyId, id);
  if (!state || !state.done) {
    return NextResponse.json({ error: "Finish this home first." }, { status: 400 });
  }

  const r = await submitPropertyEntry(propertyId, date, {
    id,
    name,
    guess: state.bestGuess,
    score: rankScore(state.bestPct, state.attempts),
    pctError: state.bestPct,
    attempts: state.attempts,
  });
  return NextResponse.json({ rank: r.rank, count: r.count });
}

// A home's all-time leaderboard: top 5 + the caller's own placement. The board is
// only handed out once the caller has finished THIS home today (other players'
// guesses would otherwise leak the price), so a request for a home still in
// progress comes back locked, with just the headcount.
export async function GET(req: Request) {
  if (!leaderboardEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId");
  const id = url.searchParams.get("id");
  if (!propertyId || !getPropertyById(propertyId)) {
    return NextResponse.json({ error: "Unknown home." }, { status: 400 });
  }

  try {
    const date = dayKey();
    const myGame = id ? await getGame(date, propertyId, id) : null;
    let unlocked = myGame?.done === true;

    // A room player has no daily game state for this home — their completion
    // lives in the room's per-round state. `room` names the room to check, so a
    // finished round unlocks the same board the daily reveal shows.
    const roomId = url.searchParams.get("room");
    if (!unlocked && roomId && id) {
      const room = await getRoom(roomId);
      const round = room?.propertyIds.indexOf(propertyId) ?? -1;
      if (room && round >= 0) {
        const roomGame = await getRoomGame(roomId, id);
        unlocked = roomGame?.rounds?.[round]?.done === true;
      }
    }

    const count = await propertyBoardCount(propertyId);
    if (!unlocked) {
      // Don't reveal others' guesses while the caller is still playing this home.
      return NextResponse.json({ enabled: true, propertyId, locked: true, count });
    }

    const [top, me] = await Promise.all([
      topPropertyEntries(propertyId, 5),
      id ? propertyStanding(propertyId, id) : Promise.resolve(null),
    ]);
    return NextResponse.json({ enabled: true, propertyId, locked: false, top, count, me });
  } catch (err) {
    console.error("[/api/leaderboard]", err);
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 502 });
  }
}
