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

// One in-progress game per (day, property, player). Keyed by property as well as
// date so the day's three homes — and any future day a home reappears on — each
// track their own attempts independently.
const gameKey = (date: string, propertyId: string, id: string) => `game:${date}:${propertyId}:${id}`;

export async function getGame(date: string, propertyId: string, id: string): Promise<GameState | null> {
  if (!redis) return null;
  return (await redis.get<GameState>(gameKey(date, propertyId, id))) ?? null;
}

export async function saveGame(
  date: string,
  propertyId: string,
  id: string,
  state: GameState,
): Promise<void> {
  if (!redis) return;
  await redis.set(gameKey(date, propertyId, id), state, { ex: 60 * 60 * 24 * 3 }); // 3-day TTL
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

// ── Per-property leaderboards ────────────────────────────────────────────────
// The board lives on the PROPERTY, not the day: everyone who has ever guessed a
// given home competes on one all-time board. A date-scoped board is written
// alongside the all-time one on every submit, so a per-day-per-property
// leaderboard can be switched on later with zero backfill — the data is already
// there, just not yet read. `scope` is "all" for the all-time board or a YYYY-MM-DD
// date for that day's board on the same property.
type BoardScope = "all" | string;
const propSetKey = (propertyId: string, scope: BoardScope) =>
  scope === "all" ? `plb:${propertyId}` : `plb:${propertyId}:${scope}`;
const propMetaKey = (propertyId: string, scope: BoardScope) =>
  scope === "all" ? `plbmeta:${propertyId}` : `plbmeta:${propertyId}:${scope}`;

function parseEntries(ids: string[], raw: Record<string, string> | null): Entry[] {
  return ids
    .map((id) => raw?.[id])
    .filter((v): v is string => Boolean(v))
    .map((v) => (typeof v === "string" ? (JSON.parse(v) as Entry) : (v as Entry)));
}

// Record a player's result on a property's board. Best score WINS (GT): replaying
// a home that comes around again only moves you up, never down, and the same call
// can't drag your standing back. Writes the all-time board and the day's board in
// lockstep. Returns the player's all-time rank + the board's all-time size.
export async function submitPropertyEntry(
  propertyId: string,
  date: string,
  entry: Entry,
): Promise<{ rank: number | null; count: number }> {
  if (!redis) throw new Error("Leaderboard not configured");

  for (const scope of ["all", date] as BoardScope[]) {
    // GT + CH → only updates an existing member when the new score is higher, and
    // returns how many members changed (a brand-new member counts as changed), so
    // the display hash is refreshed exactly when the ranking actually moved.
    const changed = await redis.zadd(
      propSetKey(propertyId, scope),
      { gt: true, ch: true },
      { member: entry.id, score: entry.score },
    );
    if (changed) {
      await redis.hset(propMetaKey(propertyId, scope), { [entry.id]: JSON.stringify(entry) });
    }
  }

  const allSet = propSetKey(propertyId, "all");
  const [count, revrank] = await Promise.all([redis.zcard(allSet), redis.zrevrank(allSet, entry.id)]);
  return { rank: revrank === null ? null : revrank + 1, count };
}

// Top `limit` entries for a property, best score first (all-time by default).
export async function topPropertyEntries(
  propertyId: string,
  limit = 10,
  scope: BoardScope = "all",
): Promise<Entry[]> {
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(propSetKey(propertyId, scope), 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const raw = await redis.hmget<Record<string, string>>(propMetaKey(propertyId, scope), ...ids);
  return parseEntries(ids, raw);
}

export async function propertyBoardCount(propertyId: string, scope: BoardScope = "all"): Promise<number> {
  if (!redis) return 0;
  return redis.zcard(propSetKey(propertyId, scope));
}

// Where a single player ranks on a property's board, plus their entry. Returns
// null if they haven't joined the board yet (played but no name).
export async function propertyStanding(
  propertyId: string,
  id: string,
  scope: BoardScope = "all",
): Promise<{ rank: number; entry: Entry | null } | null> {
  if (!redis) return null;
  const revrank = await redis.zrevrank(propSetKey(propertyId, scope), id);
  if (revrank === null) return null;
  const raw = await redis.hget<string | Entry>(propMetaKey(propertyId, scope), id);
  const entry = raw ? (typeof raw === "string" ? (JSON.parse(raw) as Entry) : raw) : null;
  return { rank: revrank + 1, entry };
}

// ── Gallery cache ────────────────────────────────────────────────────────────
// Full photo galleries fetched at runtime (admin/cron) live in Redis, since
// Vercel's filesystem is read-only and can't update the committed snapshot.
// Bump the version suffix when the gallery's max size changes so already-cached
// (smaller) galleries are treated as a miss and re-warmed with the fuller set.
const galleryKey = (id: string) => `gallery:v2:${id}`;

export async function getGallery(id: string): Promise<string[] | null> {
  if (!redis) return null;
  return (await redis.get<string[]>(galleryKey(id))) ?? null;
}

export async function saveGallery(id: string, photos: string[]): Promise<void> {
  if (!redis || !photos.length) return;
  await redis.set(galleryKey(id), photos); // persist
}

// ── Enrichment attempt marker ────────────────────────────────────────────────
// Some listings can never be enriched (realtor16 has no richer gallery, or no
// longer knows the listing). Without a marker, every page load that touches such
// a listing re-spends an upstream request — and a room full of them re-fetches
// on EVERY visit. Mark that we tried, and don't try again for a day.
const warmTriedKey = (id: string) => `warmtried:${id}`;
const WARM_RETRY_SECONDS = 60 * 60 * 24;

export async function wasWarmTried(id: string): Promise<boolean> {
  if (!redis) return false;
  return (await redis.get(warmTriedKey(id))) !== null;
}

export async function markWarmTried(id: string): Promise<void> {
  if (!redis) return;
  await redis.set(warmTriedKey(id), 1, { ex: WARM_RETRY_SECONDS });
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

// ── Feature flag: the classic 3-homes-per-day cap ───────────────────────────
// OFF by default (players may keep playing bonus homes past the slate). An admin
// can flip it back ON from /admin to restore the classic 3-per-day ritual —
// /api/daily advertises the state and the bonus endpoint enforces it.
const dailyLimitKey = "flag:daily-limit";

export async function dailyLimitEnabled(): Promise<boolean> {
  if (!redis) return false;
  return (await redis.get(dailyLimitKey)) === "on";
}

export async function setDailyLimit(on: boolean): Promise<void> {
  if (!redis) return;
  await redis.set(dailyLimitKey, on ? "on" : "off");
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

// Wipe every player's in-progress game for `date` so everyone starts fresh on the
// newly-rotated home of the day. Per-property leaderboards are all-time and live
// on the home itself, so they're deliberately left intact.
export async function clearDailyState(date: string): Promise<number> {
  if (!redis) return 0;
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await redis.scan(cursor, { match: `game:${date}:*`, count: 200 });
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);
  if (keys.length) await redis.del(...keys);
  return keys.length;
}
