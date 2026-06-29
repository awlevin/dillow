import { Redis } from "@upstash/redis";
import type { PropertyDetails } from "./property-details";
import type { CommunityStats } from "./types";

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

// Shared Redis client for other storage modules (e.g. lib/room.ts) so the same
// connection + graceful-degradation behaviour is reused everywhere.
export function getRedis(): Redis | null {
  return redis;
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

// Where a single player placed for `date`, plus their entry. Returns null if
// they haven't joined the board yet (played but no name, or didn't play).
export async function playerStanding(
  date: string,
  id: string,
): Promise<{ rank: number; entry: Entry | null } | null> {
  if (!redis) return null;
  const revrank = await redis.zrevrank(setKey(date), id);
  if (revrank === null) return null;
  const raw = await redis.hget<string | Entry>(metaKey(date), id);
  const entry = raw ? (typeof raw === "string" ? (JSON.parse(raw) as Entry) : raw) : null;
  return { rank: revrank + 1, entry };
}

// ── Gallery cache ────────────────────────────────────────────────────────────
// Full photo galleries fetched at runtime (admin/cron) live in Redis, since
// Vercel's filesystem is read-only and can't update the committed snapshot.
const galleryKey = (id: string) => `gallery:${id}`;

export async function getGallery(id: string): Promise<string[] | null> {
  if (!redis) return null;
  return (await redis.get<string[]>(galleryKey(id))) ?? null;
}

export async function saveGallery(id: string, photos: string[]): Promise<void> {
  if (!redis || !photos.length) return;
  await redis.set(galleryKey(id), photos); // persist
}

// ── Rich detail cache ────────────────────────────────────────────────────────
// The "Advanced" modal's data (description + categorized features). Like the
// gallery, it's fetched at runtime from the provider's details endpoint and kept
// in Redis rather than baked into the read-only snapshot.
// Bump the version suffix whenever PropertyDetails gains/changes a field, so
// already-cached entries are treated as a miss and re-warmed with the new shape.
const detailsKey = (id: string) => `details:v2:${id}`;

export async function getDetails(id: string): Promise<PropertyDetails | null> {
  if (!redis) return null;
  return (await redis.get<PropertyDetails>(detailsKey(id))) ?? null;
}

export async function saveDetails(id: string, details: PropertyDetails): Promise<void> {
  if (!redis) return;
  await redis.set(detailsKey(id), details); // persist
}

// ── Community valuation ──────────────────────────────────────────────────────
// Per-property aggregate of players' FIRST (blind) guesses — the signal for
// whether the crowd thinks a home is over- or under-priced. The first guess is
// used on purpose: every later guess chases the higher/lower feedback toward the
// real price, so only the opening guess reflects an honest valuation. We keep a
// geometric mean (running count + sum of ln) so a few wild guesses can't dominate,
// and one vote per player via a seen-set. Keyed by property id (not date), so the
// sample accumulates across every day/room the home appears in.
const valuationKey = (id: string) => `pstats:${id}`;
const valuationSeenKey = (id: string) => `pstatsseen:${id}`;
const MIN_VALUATION_SAMPLE = 2; // need at least a couple of guesses before it's a "crowd"

export async function recordFirstGuess(propertyId: string, playerId: string, guess: number): Promise<void> {
  if (!redis || !(guess > 0)) return;
  const fresh = await redis.sadd(valuationSeenKey(propertyId), playerId);
  if (fresh === 0) return; // this player's first guess is already counted
  await redis.hincrby(valuationKey(propertyId), "n", 1);
  await redis.hincrbyfloat(valuationKey(propertyId), "sumln", Math.log(guess));
}

export async function getCommunityStats(propertyId: string, actual: number): Promise<CommunityStats | null> {
  if (!redis || !(actual > 0)) return null;
  const h = await redis.hgetall<{ n: number | string; sumln: number | string }>(valuationKey(propertyId));
  if (!h) return null;
  const n = Number(h.n);
  const sumln = Number(h.sumln);
  if (!Number.isFinite(n) || n < MIN_VALUATION_SAMPLE || !Number.isFinite(sumln)) return null;
  const typicalGuess = Math.exp(sumln / n);
  return { n, typicalGuess, deltaPct: (typicalGuess - actual) / actual };
}

// ── Admin: rotate the property of the day ────────────────────────────────────
// A per-day offset shifts the deterministic daily pick for everyone.
const offsetKey = (date: string) => `offset:${date}`;

export async function getDailyOffset(date: string): Promise<number> {
  if (!redis) return 0;
  return (await redis.get<number>(offsetKey(date))) ?? 0;
}

export async function bumpDailyOffset(date: string): Promise<number> {
  if (!redis) return 0;
  return redis.incr(offsetKey(date));
}

// Wipe today's leaderboard + every player's in-progress game so everyone starts
// fresh on the newly-rotated property.
export async function clearDailyState(date: string): Promise<number> {
  if (!redis) return 0;
  const keys: string[] = [setKey(date), metaKey(date)];
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: `${gameKey(date, "")}*`, count: 200 });
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);
  if (keys.length) await redis.del(...keys);
  return keys.length;
}
