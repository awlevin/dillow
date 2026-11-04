import type { Property } from "./types";
import snapshot from "@/data/pool.json";
export {
  feedback,
  narrowBounds,
  WIN_THRESHOLD,
  type Band,
  type Direction,
} from "./feedback";

// ── Property pool (build-time snapshot) ──────────────────────────────────────
// Play-time makes ZERO upstream API calls — it reads a snapshot baked in at
// build time. The real snapshot is made by POST /api/refresh and kept in a
// private data store (scripts/data.mjs); without credentials the build uses the
// fake sample in src/data/sample. This keeps the ~30 requests/month budget
// intact and guarantees every player sees the same property. Run a refresh to
// rotate in fresh listings.
// Never feature a property with a thin gallery — a clue with one photo is a poor
// game. The snapshot is baked with full galleries (POST /api/refresh enriches +
// filters), and selection is restricted to eligible properties as a hard guard.
export const MIN_PHOTOS = 3;

const POOL: Property[] = [...(snapshot.properties as Property[])].sort((a, b) =>
  a.id.localeCompare(b.id),
);

// Properties rich enough to be featured. Falls back to the full pool only if a
// snapshot somehow ships with nothing eligible, so the game never hard-fails.
const ELIGIBLE: Property[] = POOL.filter((p) => p.photos.length >= MIN_PHOTOS);

// The player estimates a price from the home's facts, so a featured listing must
// carry the gameplay-critical ones: enough photos, a price, real square footage /
// beds / baths, and coordinates (the map is a core location clue — a home with no
// pin to peek at is a poorer puzzle). realtor16 occasionally returns [] (or omits)
// a numeric field, which would otherwise surface as a blank "Sq Ft" or a missing
// map — this guard keeps such a listing from ever becoming the home of the day.
// price/city are already guaranteed by the provider normalizers; re-checked here
// so even a hand-edited snapshot can't slip an incomplete listing past us.
// yearBuilt is a secondary clue (often genuinely absent upstream), so it's
// intentionally NOT required — the card just hides it when missing.
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function isPlayable(p: Property): boolean {
  return (
    p.photos.length >= MIN_PHOTOS &&
    isNum(p.price) &&
    p.price > 0 &&
    isNum(p.sqft) &&
    p.sqft > 0 &&
    isNum(p.beds) &&
    p.beds >= 0 && // a studio is 0 beds and still playable
    isNum(p.baths) &&
    p.baths > 0 &&
    isNum(p.lat) &&
    isNum(p.lon)
  );
}

export function getPool(): Property[] {
  return POOL;
}

// The slider's top bound. Derived from the priciest listing in the whole pool
// (not today's pick) so it never leaks the day's answer, yet always reaches the
// most expensive home we might feature. Rounded up to a "nice" 1/2/5 × 10ⁿ
// value with headroom so even the top listing isn't pinned to the very end of
// the slider. Floor keeps the bound sane when the pool is small/cheap.
const PRICE_CEILING_FLOOR = 25_000_000;
function niceCeil(n: number): number {
  if (n <= 0) return PRICE_CEILING_FLOOR;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const lead = n / pow;
  const step = lead <= 1 ? 1 : lead <= 2 ? 2 : lead <= 5 ? 5 : 10;
  return step * pow;
}
export function priceCeiling(): number {
  const pool = ELIGIBLE.length ? ELIGIBLE : POOL;
  const max = pool.reduce((m, p) => Math.max(m, p.price), 0);
  return Math.max(PRICE_CEILING_FLOOR, niceCeil(max * 1.2));
}

// The slider's bottom bound — the mirror of priceCeiling. The pool can carry
// listings well under the old $50k floor (down to a few thousand), which were
// just as unreachable as the $400M outlier was above. Round DOWN to a nice
// value below the cheapest listing, capped at $50k so a typical pool keeps a
// sensible floor.
const PRICE_FLOOR_CAP = 50_000;
function niceFloor(n: number): number {
  if (n <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const lead = n / pow;
  const step = lead >= 5 ? 5 : lead >= 2 ? 2 : 1;
  return step * pow;
}
export function priceFloor(): number {
  const pool = ELIGIBLE.length ? ELIGIBLE : POOL;
  const min = pool.reduce((m, p) => Math.min(m, p.price), Infinity);
  if (!Number.isFinite(min)) return PRICE_FLOOR_CAP;
  return Math.min(PRICE_FLOOR_CAP, niceFloor(min * 0.8));
}

export function snapshotFetchedAt(): string {
  return snapshot.fetchedAt;
}

// ── Deterministic daily selection ────────────────────────────────────────────
// Everyone in the world gets the same property for a given day, and the day
// rolls over at midnight Eastern (not UTC) so the "new home" drops at a sane
// local-feeling hour for the (US) audience rather than mid-afternoon. The
// client countdown in app/_lib/game-day.ts targets the same boundary.
export const GAME_TZ = "America/New_York";

// en-CA formats as YYYY-MM-DD, which is exactly our key shape.
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dayKey(d = new Date()): string {
  return dayFmt.format(d); // YYYY-MM-DD in GAME_TZ
}

// dayKey shifted by N days (e.g. yesterday = dayKeyOffset(-1)). Shifts the
// calendar date via UTC noon so it stays DST-proof — noon never lands near a
// midnight boundary, so the formatted date advances by exactly `deltaDays`.
export function dayKeyOffset(deltaDays: number, base = new Date()): string {
  const [y, m, d] = dayKey(base).split("-").map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d + deltaDays, 12)));
}

// A valid past date string we have content for — used to gate the next-day reveal.
export function isPastDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < dayKey();
}

function hash(s: string): number {
  // FNV-1a — small, deterministic, no deps.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// `offset` lets an admin rotate the property of the day: it shifts the otherwise
// deterministic pick to the next listing(s) in the pool.
export function getDailyProperty(key = dayKey(), offset = 0): Property {
  const pool = ELIGIBLE.length ? ELIGIBLE : POOL;
  if (!pool.length) throw new Error("Property pool is empty — run POST /api/refresh");
  const start = (hash(key) + offset) % pool.length;
  // Skip listings missing the facts the game is played on by deterministically
  // advancing to the next complete one. Everyone still lands on the same home,
  // but a thin clue (e.g. no square footage) never becomes the home of the day.
  // Only days that *would* have picked an incomplete listing change; every other
  // day is untouched, so settled leaderboards stay consistent.
  for (let n = 0; n < pool.length; n++) {
    const p = pool[(start + n) % pool.length];
    if (isPlayable(p)) return p;
  }
  return pool[start]; // nothing playable in the pool — return the raw pick rather than hard-fail
}

// Look up a featured property by id (used to resolve a room's stored rounds).
const BY_ID = new Map(POOL.map((p) => [p.id, p]));
export function getPropertyById(id: string): Property | undefined {
  return BY_ID.get(id);
}

// ── The daily slate: three homes a day ───────────────────────────────────────
// Every player gets three homes to guess each day:
//   • standard — the deterministic "home of the day" (getDailyProperty), shared
//     by everyone and rotatable by an admin.
//   • premium  — a deliberately high-end home from the priciest slice of the
//     pool, for a "big spender" round.
//   • local    — a home near the player, inferred from their (coarse, IP-level)
//     location; falls back to a deterministic "wildcard" home when we can't
//     place them (e.g. no geo signal in local dev).
// The three are always distinct. premium/wildcard are pure functions of the day,
// so they're identical for everyone; local depends only on the request's coarse
// coordinates, so it's stable for a player across a session.
export type SlotKind = "standard" | "premium" | "local" | "wildcard";

export type SlateSlot = {
  slot: number;
  kind: SlotKind;
  property: Property;
};

function basePool(): Property[] {
  return ELIGIBLE.length ? ELIGIBLE : POOL;
}

// Deterministically pick a playable property from `pool`, seeded by `key`, while
// skipping any id another slot already claimed. Mirrors getDailyProperty's
// skip-forward so everyone seeded the same way lands on the same home.
function pickFrom(pool: Property[], key: string, exclude: Set<string>): Property | null {
  if (!pool.length) return null;
  const start = hash(key) % pool.length;
  // Pass 0 respects `exclude`; pass 1 ignores it as a last resort, so a tiny
  // sub-pool (e.g. a single premium home) still yields a pick rather than null.
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < pool.length; n++) {
      const p = pool[(start + n) % pool.length];
      if (isPlayable(p) && (pass === 1 || !exclude.has(p.id))) return p;
    }
  }
  return null;
}

// The priciest slice of the pool — the candidates for the "big spender" slot.
// Top fraction by price with an absolute floor so the slot is always genuinely
// high-end, yet the set stays large enough to rotate for weeks without repeating.
const PREMIUM_TOP_FRACTION = 0.08;
const PREMIUM_MIN_PRICE = 2_000_000;
const PREMIUM_POOL: Property[] = (() => {
  const playable = basePool().filter(isPlayable);
  const byPrice = [...playable].sort((a, b) => b.price - a.price);
  const n = Math.max(8, Math.ceil(byPrice.length * PREMIUM_TOP_FRACTION));
  const top = byPrice.slice(0, n);
  const pricey = top.filter((p) => p.price >= PREMIUM_MIN_PRICE);
  return pricey.length ? pricey : top;
})();

export function getPremiumProperty(key = dayKey(), exclude: Set<string> = new Set()): Property | null {
  return pickFrom(PREMIUM_POOL, `${key}:premium`, exclude);
}

export function getWildcardProperty(key = dayKey(), exclude: Set<string> = new Set()): Property | null {
  return pickFrom(basePool(), `${key}:wildcard`, exclude);
}

// City centroids, averaged from the pool's playable homes — the lookup table that
// turns a player's coordinates into "their" city. Built once at module load.
type CityCentroid = { city: string; state: string; lat: number; lon: number };
const CITY_CENTROIDS: CityCentroid[] = (() => {
  const groups = new Map<string, { city: string; state: string; lat: number; lon: number; n: number }>();
  for (const p of basePool()) {
    if (!isPlayable(p) || p.lat == null || p.lon == null) continue;
    const k = `${p.city}|${p.state}`;
    const g = groups.get(k) ?? { city: p.city, state: p.state, lat: 0, lon: 0, n: 0 };
    g.lat += p.lat;
    g.lon += p.lon;
    g.n += 1;
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ city: g.city, state: g.state, lat: g.lat / g.n, lon: g.lon / g.n }));
})();

// Squared equirectangular distance — monotonic in true distance over the spans we
// compare (US metros), so it ranks nearest-city correctly without a haversine.
function cityDistSq(lat: number, lon: number, c: CityCentroid): number {
  const k = Math.cos((lat * Math.PI) / 180);
  const dLat = lat - c.lat;
  const dLon = (lon - c.lon) * k;
  return dLat * dLat + dLon * dLon;
}

export function nearestCity(lat: number, lon: number): CityCentroid | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: CityCentroid | null = null;
  let bestD = Infinity;
  for (const c of CITY_CENTROIDS) {
    const d = cityDistSq(lat, lon, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// How far the nearest city may be before "near you" stops being honest. ~7° of
// arc (≈480 mi) keeps players across the continental US tied to a real metro,
// while an overseas visitor — whose nearest pool city is an ocean away — drops
// through to a wildcard instead of a bogus "near you".
const MAX_LOCAL_DIST_SQ = 7 * 7;

// A playable home near (lat, lon): the nearest city's deterministic pick, walking
// out to the next-nearest cities if that city has nothing distinct left to offer,
// so the local slot resolves to a real, distinct home — unless the player is too
// far from any city to call it local, in which case it returns null (→ wildcard).
export function getLocalProperty(
  key: string,
  lat: number,
  lon: number,
  exclude: Set<string> = new Set(),
): Property | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !CITY_CENTROIDS.length) return null;
  const byDistance = [...CITY_CENTROIDS].sort((a, b) => cityDistSq(lat, lon, a) - cityDistSq(lat, lon, b));
  if (cityDistSq(lat, lon, byDistance[0]) > MAX_LOCAL_DIST_SQ) return null; // nobody nearby
  for (const c of byDistance) {
    const inCity = basePool().filter((p) => p.city === c.city && p.state === c.state);
    const pick = pickFrom(inCity, `${key}:local`, exclude);
    if (pick) return pick;
  }
  return null;
}

// One row per city that has at least one playable home: its name, state, playable
// count, and centroid (reused from the same CITY_CENTROIDS machinery the local slot
// resolves against). Sorted by count (busiest first), then city name — the shape
// Local mode's picker renders when we can't (or won't) geolocate the player.
export function listCities(): { city: string; state: string; count: number; lat: number; lon: number }[] {
  const counts = new Map<string, number>();
  for (const p of basePool()) {
    if (!isPlayable(p)) continue;
    const k = `${p.city}|${p.state}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return CITY_CENTROIDS.map((c) => ({
    city: c.city,
    state: c.state,
    count: counts.get(`${c.city}|${c.state}`) ?? 0,
    lat: c.lat,
    lon: c.lon,
  }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

// The day's deterministic queue of homes near a point, for endless Local mode. The
// anchor is the nearest city, honesty-capped exactly like the local slot: too far
// from any pool city and it returns an empty queue with a null city, so the caller
// can fall back to the picker. The queue is every playable home from all cities
// whose centroid lies within the cap, grouped nearest-city-first; within each city
// the order is a day-seeded shuffle keyed on the city (not the exact coords), so two
// players in the same metro share a stable order regardless of their precise pin.
// `exclude` drops already-served ids, `total` is counted AFTER exclusion, and
// `start`/`count` page through what's left. Deterministic per day + coords, which is
// what lets a client re-attach saved progress after a reload.
export function getLocalQueue(
  key: string,
  lat: number,
  lon: number,
  start: number,
  count: number,
  exclude: Set<string>,
): { city: { city: string; state: string } | null; homes: Property[]; total: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !CITY_CENTROIDS.length) {
    return { city: null, homes: [], total: 0 };
  }
  const byDistance = [...CITY_CENTROIDS].sort((a, b) => cityDistSq(lat, lon, a) - cityDistSq(lat, lon, b));
  if (cityDistSq(lat, lon, byDistance[0]) > MAX_LOCAL_DIST_SQ) {
    return { city: null, homes: [], total: 0 }; // nobody nearby → picker fallback
  }
  const anchor = byDistance[0];
  const queue: Property[] = [];
  for (const c of byDistance) {
    // Sorted ascending, so once one city is past the cap the rest are too.
    if (cityDistSq(lat, lon, c) > MAX_LOCAL_DIST_SQ) break;
    const inCity = basePool().filter((p) => isPlayable(p) && p.city === c.city && p.state === c.state);
    queue.push(...seededShuffle(inCity, `${key}:local:${c.city}|${c.state}`));
  }
  const filtered = queue.filter((p) => !exclude.has(p.id));
  return {
    city: { city: anchor.city, state: anchor.state },
    homes: filtered.slice(start, start + count),
    total: filtered.length,
  };
}

// Assemble a player's three homes for the day. `coords` come from the request's
// coarse IP geolocation; absent or unplaceable, the local slot becomes a wildcard.
export function getDailySlate(opts: {
  key?: string;
  offset?: number;
  coords?: { lat: number; lon: number } | null;
}): SlateSlot[] {
  const key = opts.key ?? dayKey();
  const exclude = new Set<string>();
  const slots: SlateSlot[] = [];

  const standard = getDailyProperty(key, opts.offset ?? 0);
  slots.push({ slot: 0, kind: "standard", property: standard });
  exclude.add(standard.id);

  const premium = getPremiumProperty(key, exclude);
  const slot1 = premium ?? getWildcardProperty(key, exclude);
  if (slot1) {
    slots.push({ slot: 1, kind: premium ? "premium" : "wildcard", property: slot1 });
    exclude.add(slot1.id);
  }

  const local = opts.coords ? getLocalProperty(key, opts.coords.lat, opts.coords.lon, exclude) : null;
  const slot2 = local ?? getWildcardProperty(key, exclude);
  if (slot2) {
    slots.push({ slot: 2, kind: local ? "local" : "wildcard", property: slot2 });
    exclude.add(slot2.id);
  }

  return slots;
}

// Small deterministic PRNG so a seed yields a stable shuffle (no Math.random).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic Fisher–Yates: the same seed always yields the same order.
function seededShuffle(pool: Property[], seed: string): Property[] {
  const rand = mulberry32(hash(seed));
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Held to the daily-game completeness bar; falls back to the photos-only pool
// only if that would leave nothing to pick from.
function playablePool(): Property[] {
  const base = ELIGIBLE.length ? ELIGIBLE : POOL;
  const playable = base.filter(isPlayable);
  const pool = playable.length ? playable : base;
  if (!pool.length) throw new Error("Property pool is empty — run POST /api/refresh");
  return pool;
}

// Deterministic, distinct property picks for a room's bonus rounds. Seeded by the
// room id so every member plays the same set in the same order, with the daily
// home excluded so the rooms feel like fresh listings.
export function pickRoomProperties(seed: string, count: number, excludeId?: string): Property[] {
  const order = seededShuffle(playablePool().filter((p) => p.id !== excludeId), seed);
  return order.slice(0, Math.min(count, order.length));
}

// The day's endless "bonus" queue for the main mode: a date-seeded shuffle of the
// whole playable pool, minus the caller's slate (which varies with their coarse
// location, so the exclusions come from the request). Deterministic per day, so
// a player reloading mid-run is served the exact same bonus homes in the same
// order — that's what lets their saved progress re-attach.
export function getBonusProperties(
  key: string,
  exclude: Set<string>,
  start: number,
  count: number,
): Property[] {
  const order = seededShuffle(playablePool(), `${key}:bonus`).filter((p) => !exclude.has(p.id));
  return order.slice(start, start + count);
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// Log-error so a $5M mansion and a $200k condo are judged on the same curve:
// being "20% off" costs the same number of points regardless of price.
export type GuessResult = {
  guess: number;
  actual: number;
  pctError: number; // signed: + = overguessed, - = underguessed
  score: number; // 0–100
  verdict: string;
  direction: "high" | "low" | "exact";
};

export const MAX_ATTEMPTS = 5;

// Cumulative points for a single CHALLENGE-ROOM round: closeness drives it, and
// each extra attempt shaves a few points so fewer-tries plays scores higher. Used
// only by rooms, where round points are summed into a total. The daily leaderboard
// does NOT use this — it ranks by raw closeness (see rankScore).
export function finalScore(bestScore: number, attemptsUsed: number): number {
  return Math.max(0, Math.round(bestScore - (attemptsUsed - 1) * 3));
}

// ── Daily leaderboard ranking ────────────────────────────────────────────────
// The daily board ranks by the SAME accuracy it prints: the closest guess wins,
// and ties at the shown granularity are broken by fewer attempts. No hidden curve
// and no per-attempt point penalty — read the board top-to-bottom and the order
// matches the "% off · tries" on every row.

// Accuracy as shown on the board, in percent: whole numbers at/above 1%, tenths
// below it so near-misses still separate (0.1% vs 0.2%). Keep this rule in lockstep
// with formatPct() in app/_lib/format.ts, which prints the same value.
export function displayPct(pctError: number): number {
  const pct = Math.abs(pctError) * 100;
  return pct < 1 ? Math.round(pct * 10) / 10 : Math.round(pct);
}

// Single sortable key for the daily sorted set (higher = better). The ×100 spacing
// lets the shown accuracy dominate while leaving room for attempts (1–5) to break
// exact ties — a 0.1% gap (10 points) always outweighs the most attempts can.
export function rankScore(pctError: number, attempts: number): number {
  return -(displayPct(pctError) * 100 + attempts);
}

export function scoreGuess(guess: number, actual: number): GuessResult {
  const ratio = guess / actual;
  const logErr = Math.abs(Math.log(ratio));
  const score = Math.max(0, Math.round(100 * Math.exp(-logErr * 3)));
  const pctError = (guess - actual) / actual;
  const absPct = Math.abs(pctError);

  let verdict: string;
  if (absPct < 0.02) verdict = "🎯 Bullseye!";
  else if (absPct < 0.05) verdict = "🔥 Excellent";
  else if (absPct < 0.1) verdict = "👏 Great guess";
  else if (absPct < 0.2) verdict = "👍 Close";
  else if (absPct < 0.35) verdict = "😬 Not bad";
  else if (absPct < 0.6) verdict = "🥶 Way off";
  else verdict = "💀 Ice cold";

  const direction = absPct < 0.02 ? "exact" : guess > actual ? "high" : "low";
  return { guess, actual, pctError, score, verdict, direction };
}
