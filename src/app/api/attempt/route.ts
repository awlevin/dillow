import { NextResponse } from "next/server";
import {
  getPropertyById,
  isPlayable,
  scoreGuess,
  feedback,
  rankScore,
  dayKey,
  MAX_ATTEMPTS,
  WIN_THRESHOLD,
} from "@/lib/game";
import type { Property } from "@/lib/types";
import {
  leaderboardEnabled,
  submitPropertyEntry,
  getGame,
  saveGame,
  getDetails,
  recordFirstGuess,
  getCommunityStats,
  type GameState,
} from "@/lib/leaderboard";

// One guess on one of the day's homes. Returns hidden-price feedback (aim
// higher/lower + a proximity band) until the player wins (within 5%) or uses all
// 5 attempts — then it reveals the home and records the result on THAT home's
// all-time leaderboard. The home is identified by `propertyId` (one of the three
// the player was served by /api/daily), so the same endpoint scores any of them.
export async function POST(req: Request) {
  let body: { guess?: unknown; id?: unknown; name?: unknown; propertyId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const guess = body.guess;
  if (typeof guess !== "number" || !Number.isFinite(guess) || guess <= 0) {
    return NextResponse.json({ error: "Guess must be a positive number." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";

  // The home is whichever of today's served homes the client is guessing on. We
  // re-resolve it from the pool (never trusting a client-supplied price) and
  // require it to be a real, playable listing.
  const propertyId = typeof body.propertyId === "string" ? body.propertyId : null;
  const property = propertyId ? getPropertyById(propertyId) : undefined;
  if (!property || !isPlayable(property)) {
    return NextResponse.json({ error: "Unknown home." }, { status: 400 });
  }

  try {
    const date = dayKey();
    const price = property.price;
    const fb = feedback(guess, price);
    const thisScore = scoreGuess(guess, price).score;
    const pctError = (guess - price) / price;

    // No persistence (Redis off) or no id → fall back to single-shot reveal.
    if (!leaderboardEnabled() || !id) {
      return NextResponse.json({
        gameOver: true,
        within: fb.within,
        attemptsUsed: 1,
        band: fb.band,
        property,
        details: await getDetails(property.id), // full set — the game is over
        communityStats: await getCommunityStats(property.id, price),
        result: {
          bestGuess: guess,
          bestScore: thisScore,
          pctError,
          within: fb.within,
          attemptsUsed: 1,
        },
        leaderboard: { enabled: leaderboardEnabled() },
      });
    }

    const prev: GameState = (await getGame(date, property.id, id)) ?? {
      attempts: 0,
      bestScore: -1,
      bestGuess: guess,
      bestPct: pctError,
      guesses: [],
      done: false,
    };

    // The opening guess is the blind one — record it for the home's crowd
    // valuation (deduped per player) before the higher/lower hints kick in.
    if (prev.attempts === 0) await recordFirstGuess(property.id, id, guess);

    // Already finished this home today — replay the final reveal without advancing.
    if (prev.done) {
      return finalReveal(date, id, name, property, prev, prev.attempts, false);
    }

    const attempts = prev.attempts + 1;
    const better = thisScore > prev.bestScore;
    const state: GameState = {
      attempts,
      bestScore: Math.max(prev.bestScore, thisScore),
      bestGuess: better ? guess : prev.bestGuess,
      bestPct: better ? pctError : prev.bestPct,
      guesses: [...prev.guesses, guess],
      done: fb.within || attempts >= MAX_ATTEMPTS,
    };
    await saveGame(date, property.id, id, state);

    if (state.done) {
      return finalReveal(date, id, name, property, state, attempts, true);
    }

    // Mid-game: feedback only, price stays hidden.
    return NextResponse.json({
      gameOver: false,
      direction: fb.direction,
      band: fb.band,
      attemptsUsed: attempts,
      remaining: MAX_ATTEMPTS - attempts,
    });
  } catch (err) {
    console.error("[/api/attempt]", err);
    return NextResponse.json({ error: "Could not process your guess." }, { status: 502 });
  }
}

async function finalReveal(
  date: string,
  id: string,
  name: string,
  property: Property,
  state: GameState,
  attemptsUsed: number,
  record: boolean,
) {
  const lastGuess = state.guesses[state.guesses.length - 1] ?? state.bestGuess;
  const lastFb = feedback(lastGuess, property.price);
  // "Won" (and the celebratory reveal) means landing within the game's win
  // threshold — the SAME 1% you have to hit to end the round early — not the
  // looser 5% the reveal used to flag.
  const within = Math.abs(state.bestPct) <= WIN_THRESHOLD;
  let leaderboard: { enabled: boolean; rank?: number | null; count?: number } = {
    enabled: leaderboardEnabled(),
  };
  if (record && name) {
    const r = await submitPropertyEntry(property.id, date, {
      id,
      name,
      guess: state.bestGuess,
      score: rankScore(state.bestPct, attemptsUsed),
      pctError: state.bestPct,
      attempts: attemptsUsed,
    });
    leaderboard = { enabled: true, rank: r.rank, count: r.count };
  }
  return NextResponse.json({
    gameOver: true,
    within,
    attemptsUsed,
    band: lastFb.band,
    direction: lastFb.direction,
    property,
    details: await getDetails(property.id), // full set — the game is over
    communityStats: await getCommunityStats(property.id, property.price),
    result: {
      bestGuess: state.bestGuess,
      bestScore: Math.max(state.bestScore, 0),
      pctError: state.bestPct,
      within,
      attemptsUsed,
    },
    leaderboard,
  });
}
