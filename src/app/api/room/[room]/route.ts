import { NextResponse } from "next/server";
import {
  feedback,
  finalScore,
  getPropertyById,
  MAX_ATTEMPTS,
  priceCeiling,
  priceFloor,
  scoreGuess,
} from "@/lib/game";
import { toClue, type Property } from "@/lib/types";
import {
  buildMember,
  getRoom,
  getRoomGame,
  roomBoard,
  roomsEnabled,
  saveRoomGame,
  upsertRoomMember,
  type RoomGame,
  type RoundState,
} from "@/lib/room";

export const dynamic = "force-dynamic";

const WIN_PCT = 0.05; // "nailed it" / win threshold for the reveal (matches daily)

type Ctx = { params: Promise<{ room: string }> };

function roundResult(state: RoundState) {
  const within = Math.abs(state.bestPct) <= WIN_PCT;
  return {
    bestGuess: state.bestGuess,
    bestScore: Math.max(state.bestScore, 0),
    finalScore: finalScore(Math.max(state.bestScore, 0), state.attempts),
    pctError: state.bestPct,
    within,
    attemptsUsed: state.attempts,
  };
}

// Room info for the caller: clues for unfinished rounds, full reveals for rounds
// they've already completed, the board, and their own standing.
export async function GET(req: Request, ctx: Ctx) {
  if (!roomsEnabled()) return NextResponse.json({ enabled: false });

  const { room: roomId } = await ctx.params;
  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const id = new URL(req.url).searchParams.get("id");

  try {
    const [game, board] = await Promise.all([
      id ? getRoomGame(roomId, id) : Promise.resolve(null),
      roomBoard(roomId),
    ]);

    const rounds = room.propertyIds.map((pid, i) => {
      const property = getPropertyById(pid) as Property;
      const state = game?.rounds?.[i];
      const done = state?.done === true;
      return {
        index: i,
        clue: toClue(property),
        done,
        ...(done ? { property, result: roundResult(state!) } : {}),
      };
    });

    const me = id ? (board.find((m) => m.id === id) ?? null) : null;

    return NextResponse.json({
      enabled: true,
      room: { id: room.id, date: room.date, roundCount: room.roundCount },
      priceFloor: priceFloor(),
      priceCeiling: priceCeiling(),
      rounds,
      board,
      memberCount: board.length,
      me,
    });
  } catch (err) {
    console.error("[/api/room/[room]] GET", err);
    return NextResponse.json({ error: "Could not load the room." }, { status: 502 });
  }
}

// Join (register a name) or submit one guess for one round. Attempts are enforced
// server-side and the price stays hidden until the round ends — same model as the
// daily game's /api/attempt, applied per round.
export async function POST(req: Request, ctx: Ctx) {
  if (!roomsEnabled()) return NextResponse.json({ enabled: false }, { status: 503 });

  const { room: roomId } = await ctx.params;
  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  let body: { action?: unknown; id?: unknown; name?: unknown; round?: unknown; guess?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 24) : "";
  if (!id) return NextResponse.json({ error: "Missing player id." }, { status: 400 });
  const action = body.action === "join" ? "join" : "attempt";

  try {
    // Register/refresh the member's board row (so they appear before finishing).
    if (action === "join") {
      const game = await getRoomGame(roomId, id);
      const member = buildMember(id, name, game, room.roundCount);
      await upsertRoomMember(roomId, member);
      const board = await roomBoard(roomId);
      return NextResponse.json({ ok: true, board, memberCount: board.length, me: member });
    }

    // ── Attempt ────────────────────────────────────────────────────────────
    const guess = body.guess;
    const round = body.round;
    if (typeof guess !== "number" || !Number.isFinite(guess) || guess <= 0) {
      return NextResponse.json({ error: "Guess must be a positive number." }, { status: 400 });
    }
    if (typeof round !== "number" || round < 0 || round >= room.roundCount) {
      return NextResponse.json({ error: "Invalid round." }, { status: 400 });
    }
    const property = getPropertyById(room.propertyIds[round]);
    if (!property) return NextResponse.json({ error: "Round unavailable." }, { status: 502 });

    const price = property.price;
    const fb = feedback(guess, price);
    const thisScore = scoreGuess(guess, price).score;
    const pctError = (guess - price) / price;

    const game: RoomGame = (await getRoomGame(roomId, id)) ?? { rounds: [] };
    const prev: RoundState = game.rounds[round] ?? {
      attempts: 0,
      bestScore: -1,
      bestGuess: guess,
      bestPct: pctError,
      guesses: [],
      done: false,
    };

    // Already finished this round — replay its reveal without advancing.
    if (prev.done) {
      const board = await roomBoard(roomId);
      return NextResponse.json({
        gameOver: true,
        band: feedback(prev.guesses[prev.guesses.length - 1] ?? prev.bestGuess, price).band,
        direction: feedback(prev.bestGuess, price).direction,
        property,
        result: roundResult(prev),
        board,
      });
    }

    const attempts = prev.attempts + 1;
    const better = thisScore > prev.bestScore;
    const state: RoundState = {
      attempts,
      bestScore: Math.max(prev.bestScore, thisScore),
      bestGuess: better ? guess : prev.bestGuess,
      bestPct: better ? pctError : prev.bestPct,
      guesses: [...prev.guesses, guess],
      done: fb.within || attempts >= MAX_ATTEMPTS,
    };
    game.rounds[round] = state;
    await saveRoomGame(roomId, id, game);

    if (state.done) {
      const member = buildMember(id, name, game, room.roundCount);
      await upsertRoomMember(roomId, member);
      const board = await roomBoard(roomId);
      return NextResponse.json({
        gameOver: true,
        band: fb.band,
        direction: fb.direction,
        property,
        result: roundResult(state),
        board,
        memberCount: board.length,
      });
    }

    // Mid-round: feedback only, price stays hidden.
    return NextResponse.json({
      gameOver: false,
      direction: fb.direction,
      band: fb.band,
      attemptsUsed: attempts,
      remaining: MAX_ATTEMPTS - attempts,
    });
  } catch (err) {
    console.error("[/api/room/[room]] POST", err);
    return NextResponse.json({ error: "Could not process that." }, { status: 502 });
  }
}
