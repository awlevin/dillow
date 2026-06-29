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
import { type Property } from "@/lib/types";
import { getDetails, recordFirstGuess, getCommunityStats } from "@/lib/leaderboard";
import { roundPayload } from "@/lib/property-payload";
import {
  buildMember,
  getRoom,
  getRoomGame,
  renameRoom,
  roomBoard,
  roomsEnabled,
  saveRoomGame,
  upsertRoomMember,
  type RoomGame,
  type RoundState,
} from "@/lib/room";

export const dynamic = "force-dynamic";
// A cold room may warm each round's gallery + details on first load; give it
// headroom beyond the default so those upstream fetches don't 504.
export const maxDuration = 30;

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

    // roundPayload warms each round's gallery + details and scrubs the clue — the
    // SAME builder the daily game uses, so room rounds get the richer gallery and
    // the ⓘ details modal for free instead of silently missing them.
    const rounds = await Promise.all(
      room.propertyIds.map(async (pid, i) => {
        const property = getPropertyById(pid) as Property;
        const state = game?.rounds?.[i];
        const done = state?.done === true;
        const { clue, details } = await roundPayload(property);
        return {
          index: i,
          clue,
          done,
          ...(done
            ? {
                property,
                details,
                communityStats: await getCommunityStats(property.id, property.price),
                result: roundResult(state!),
              }
            : {}),
        };
      }),
    );

    const me = id ? (board.find((m) => m.id === id) ?? null) : null;

    return NextResponse.json({
      enabled: true,
      room: { id: room.id, date: room.date, roundCount: room.roundCount, name: room.name ?? "" },
      isOwner: id != null && id === room.createdBy,
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
  const action =
    body.action === "join" ? "join" : body.action === "rename" ? "rename" : "attempt";

  try {
    // Retitle the room — only its creator may do so (from the room page).
    if (action === "rename") {
      if (room.createdBy !== id) {
        return NextResponse.json({ error: "Only the room's creator can rename it." }, { status: 403 });
      }
      await renameRoom(roomId, name);
      return NextResponse.json({ ok: true, name });
    }

    // Register/refresh the member's board row (so they appear before finishing).
    if (action === "join") {
      // The creator's first join also titles their room, if it's still unnamed.
      if (room.createdBy === id && !room.name && name) await renameRoom(roomId, name);
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

    // Opening guess on this round → feed the home's crowd valuation (deduped).
    if (prev.attempts === 0) await recordFirstGuess(property.id, id, guess);

    // Already finished this round — replay its reveal without advancing.
    if (prev.done) {
      const board = await roomBoard(roomId);
      return NextResponse.json({
        gameOver: true,
        band: feedback(prev.guesses[prev.guesses.length - 1] ?? prev.bestGuess, price).band,
        direction: feedback(prev.bestGuess, price).direction,
        property,
        details: await getDetails(property.id), // full set — the round is over
        communityStats: await getCommunityStats(property.id, price),
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
        details: await getDetails(property.id), // full set — the round is over
        communityStats: await getCommunityStats(property.id, price),
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
