import { Redis } from "@upstash/redis";

// Leaderboard storage backed by Upstash Redis sorted sets — one set per day,
// keyed by date. Scores go in the sorted set; display details in a companion
// hash. Everything degrades gracefully: with no Redis configured, the game's
// single-player loop keeps working and these functions report "not configured".

export type Entry = {
  id: string;
  name: string;
  guess: number; // best (closest) guess
  score: number; // final leaderboard score
  pctError: number; // best guess's error
  attempts: number; // tries used
};

// Per-player daily game progress, so attempts are enforced server-side and the
// price is never revealed until the game ends.
export type GameState = {
  attempts: number;
  bestScore: number;
  bestGuess: number;
  bestPct: number;
  guesses: number[];
  done: boolean;
};

const gameKey = (date: string, id: string) => `game:${date}:${id}`;

export async function getGame(date: string, id: string): Promise<GameState | null> {
  if (!redis) return null;
  return (await redis.get<GameState>(gameKey(date, id))) ?? null;
}

export async function saveGame(date: string, id: string, state: GameState): Promise<void> {
  if (!redis) return;
  await redis.set(gameKey(date, id), state, { ex: 60 * 60 * 24 * 3 }); // 3-day TTL
}

// Accept either naming scheme the Vercel/Upstash integration may inject.
const restUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const redis = restUrl && restToken ? new Redis({ url: restUrl, token: restToken }) : null;

export function leaderboardEnabled(): boolean {
  return redis !== null;
}

const setKey = (date: string) => `lb:${date}`; // sorted set: member=id, score=score
const metaKey = (date: string) => `lbmeta:${date}`; // hash: id -> JSON(Entry)

// Record a player's result for `date`. First submission per id wins (NX), so a
// one-shot daily game can't be re-stuffed. Returns their rank + the day's count.
export async function submitEntry(
  date: string,
  entry: Entry,
): Promise<{ rank: number | null; count: number; alreadyPlayed: boolean }> {
  if (!redis) throw new Error("Leaderboard not configured");

  const added = await redis.zadd(setKey(date), { nx: true }, { member: entry.id, score: entry.score });
  const alreadyPlayed = added === 0;
  if (!alreadyPlayed) {
    await redis.hset(metaKey(date), { [entry.id]: JSON.stringify(entry) });
  }
  const count = await redis.zcard(setKey(date));
  // Rank by score descending (zrevrank is 0-based).
  const revrank = await redis.zrevrank(setKey(date), entry.id);
  return { rank: revrank === null ? null : revrank + 1, count, alreadyPlayed };
}

// Top `limit` entries for a date, highest score first.
export async function topEntries(date: string, limit = 10): Promise<Entry[]> {
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(setKey(date), 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const raw = await redis.hmget<Record<string, string>>(metaKey(date), ...ids);
  return ids
    .map((id) => raw?.[id])
    .filter((v): v is string => Boolean(v))
    .map((v) => (typeof v === "string" ? (JSON.parse(v) as Entry) : (v as Entry)));
}

export async function dayCount(date: string): Promise<number> {
  if (!redis) return 0;
  return redis.zcard(setKey(date));
}
