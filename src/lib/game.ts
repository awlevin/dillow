import type { Property } from "./types";
import snapshot from "@/data/pool.json";
export {
  feedback,
  narrowBounds,
  WIN_THRESHOLD,
  type Band,
  type Direction,
} from "./feedback";

// ── Property pool (committed snapshot) ───────────────────────────────────────
// Play-time makes ZERO upstream API calls — it reads a snapshot baked at build
// time by POST /api/refresh (which spends one realtor16 request). This keeps the
// ~30 requests/month budget intact and guarantees every player sees the same
// property. Run a refresh to rotate in fresh listings.
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

// Deterministic, distinct property picks for a room's bonus rounds. Seeded by the
// room id so every member plays the same set in the same order, with the daily
// home excluded so the rooms feel like fresh listings.
export function pickRoomProperties(seed: string, count: number, excludeId?: string): Property[] {
  // Rooms show the same property card as the daily game, so hold them to the
  // same completeness bar; fall back to the photos-only pool only if that would
  // leave nothing to pick from.
  const base = (ELIGIBLE.length ? ELIGIBLE : POOL).filter((p) => p.id !== excludeId);
  const playable = base.filter(isPlayable);
  const pool = playable.length ? playable : base;
  if (!pool.length) throw new Error("Property pool is empty — run POST /api/refresh");
  const rand = mulberry32(hash(seed));
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(count, order.length));
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
