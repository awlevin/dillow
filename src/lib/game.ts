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
  return pool[(hash(key) + offset) % pool.length];
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

// Final leaderboard score from the best guess + attempts used: closeness drives
// it, and each extra attempt shaves a few points so fewer-tries plays rank higher.
export function finalScore(bestScore: number, attemptsUsed: number): number {
  return Math.max(0, Math.round(bestScore - (attemptsUsed - 1) * 3));
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
