import { getRedis } from "./leaderboard";
import { finalScore } from "./game";

// Challenge rooms: a private, day-scoped competition over a fixed set of bonus
// properties. Storage mirrors lib/leaderboard.ts — a sorted set ranks members by
// total score and a companion hash holds their display rows — and degrades the
// same way: with no Redis configured, rooms simply aren't offered.

// One member's progress on a single round. Same shape as the daily GameState so
// the scoring helpers (feedback/scoreGuess/finalScore) apply unchanged.
export type RoundState = {
  attempts: number;
  bestScore: number;
  bestGuess: number;
  bestPct: number;
  guesses: number[];
  done: boolean;
};

export type RoomGame = {
  rounds: RoundState[]; // indexed by round; sparse until a round is started
};

export type Room = {
  id: string;
  date: string;
  createdBy: string; // player id
  propertyIds: string[]; // the rounds, in order
  roundCount: number;
};

// A per-round result on the board (null = that round isn't finished yet).
export type RoundResult = { score: number; pct: number; attempts: number };

// One row on the room board: a member's aggregate plus per-round breakdown.
export type RoomMember = {
  id: string;
  name: string;
  total: number; // sum of finalScore across finished rounds
  roundsDone: number;
  rounds: (RoundResult | null)[];
};

const TTL = 60 * 60 * 24 * 3; // 3 days, matches the daily game state TTL

const roomKey = (id: string) => `room:${id}`;
const gameKey = (id: string, pid: string) => `room:${id}:game:${pid}`;
const lbKey = (id: string) => `room:${id}:lb`; // sorted set: member=pid, score=total
const metaKey = (id: string) => `room:${id}:meta`; // hash: pid -> JSON(RoomMember)

export function roomsEnabled(): boolean {
  return getRedis() !== null;
}

// Create a room. NX so a freshly-generated code can never clobber an existing
// room; returns false if the code was already taken (caller retries).
export async function createRoom(room: Room): Promise<boolean> {
  const redis = getRedis();
  if (!redis) throw new Error("Rooms not configured");
  const res = await redis.set(roomKey(room.id), room, { nx: true, ex: TTL });
  return res === "OK";
}

export async function getRoom(id: string): Promise<Room | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<Room>(roomKey(id))) ?? null;
}

export async function getRoomGame(id: string, pid: string): Promise<RoomGame | null> {
  const redis = getRedis();
  if (!redis) return null;
  return (await redis.get<RoomGame>(gameKey(id, pid))) ?? null;
}

export async function saveRoomGame(id: string, pid: string, game: RoomGame): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(gameKey(id, pid), game, { ex: TTL });
}

// Build a member's board row from their game state. Finished rounds contribute
// their finalScore to the total; unfinished rounds are null.
export function buildMember(
  id: string,
  name: string,
  game: RoomGame | null,
  roundCount: number,
): RoomMember {
  const rounds: (RoundResult | null)[] = [];
  let total = 0;
  let roundsDone = 0;
  for (let i = 0; i < roundCount; i++) {
    const r = game?.rounds?.[i];
    if (r && r.done) {
      const score = finalScore(Math.max(r.bestScore, 0), r.attempts);
      rounds[i] = { score, pct: r.bestPct, attempts: r.attempts };
      total += score;
      roundsDone++;
    } else {
      rounds[i] = null;
    }
  }
  return { id, name: name || "Anonymous", total, roundsDone, rounds };
}

// Upsert a member's row + ranking score. Score updates (no NX) as they finish
// more rounds. Keeps the board keys on the same TTL as the room.
export async function upsertRoomMember(id: string, member: RoomMember): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await Promise.all([
    redis.zadd(lbKey(id), { member: member.id, score: member.total }),
    redis.hset(metaKey(id), { [member.id]: JSON.stringify(member) }),
  ]);
  await Promise.all([redis.expire(lbKey(id), TTL), redis.expire(metaKey(id), TTL)]);
}

// Full room board, highest total first.
export async function roomBoard(id: string): Promise<RoomMember[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(lbKey(id), 0, -1, { rev: true });
  if (!ids.length) return [];
  const raw = await redis.hmget<Record<string, string>>(metaKey(id), ...ids);
  return ids
    .map((pid) => raw?.[pid])
    .filter((v): v is string => Boolean(v))
    .map((v) => (typeof v === "string" ? (JSON.parse(v) as RoomMember) : (v as RoomMember)));
}
