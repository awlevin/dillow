import { NextResponse } from "next/server";
import {
  getDailyProperty,
  scoreGuess,
  feedback,
  finalScore,
  dayKey,
  MAX_ATTEMPTS,
} from "@/lib/game";
import type { Property } from "@/lib/types";
import {
  leaderboardEnabled,
  submitEntry,
  getGame,
  saveGame,
  getDailyOffset,
  type GameState,
} from "@/lib/leaderboard";

// One guess in the daily game. Returns hidden-price feedback (aim higher/lower +
// a proximity band) until the player wins (within 5%) or uses all 5 attempts —
// then it reveals the property and records the result on today's leaderboard.
export async function POST(req: Request) {
  let body: { guess?: unknown; id?: unknown; name?: unknown };
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

  try {
    const date = dayKey();
    const property = getDailyProperty(date, await getDailyOffset(date));
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
        result: {
          bestGuess: guess,
          bestScore: thisScore,
          finalScore: thisScore,
          pctError,
          within: fb.within,
          attemptsUsed: 1,
        },
        leaderboard: { enabled: leaderboardEnabled() },
      });
    }

    const prev: GameState = (await getGame(date, id)) ?? {
      attempts: 0,
      bestScore: -1,
      bestGuess: guess,
      bestPct: pctError,
      guesses: [],
      done: false,
    };

    // Already finished today — replay the final reveal without advancing state.
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
    await saveGame(date, id, state);

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
  const fs = finalScore(Math.max(state.bestScore, 0), attemptsUsed);
  const lastGuess = state.guesses[state.guesses.length - 1] ?? state.bestGuess;
  const lastFb = feedback(lastGuess, property.price);
  let leaderboard: { enabled: boolean; rank?: number | null; count?: number } = {
    enabled: leaderboardEnabled(),
  };
  if (record && name) {
    const r = await submitEntry(date, {
      id,
      name,
      guess: state.bestGuess,
      score: fs,
      pctError: state.bestPct,
      attempts: attemptsUsed,
    });
    leaderboard = { enabled: true, rank: r.rank, count: r.count };
  }
  return NextResponse.json({
    gameOver: true,
    within: Math.abs(state.bestPct) <= 0.05,
    attemptsUsed,
    band: lastFb.band,
    direction: lastFb.direction,
    property,
    result: {
      bestGuess: state.bestGuess,
      bestScore: Math.max(state.bestScore, 0),
      finalScore: fs,
      pctError: state.bestPct,
      within: Math.abs(state.bestPct) <= 0.05,
      attemptsUsed,
    },
    leaderboard,
  });
}
