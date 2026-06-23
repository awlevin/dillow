import type { Property } from "./types";
import snapshot from "@/data/pool.json";

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

export function snapshotFetchedAt(): string {
  return snapshot.fetchedAt;
}

// ── Deterministic daily selection ────────────────────────────────────────────
// Everyone in the world gets the same property for a given UTC day.
export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// dayKey shifted by N days (e.g. yesterday = dayKeyOffset(-1)).
export function dayKeyOffset(deltaDays: number, base = new Date()): string {
  return dayKey(new Date(base.getTime() + deltaDays * 86_400_000));
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

// ── Multi-attempt gameplay (Wordle-style) ────────────────────────────────────
export const MAX_ATTEMPTS = 5;
export const WIN_THRESHOLD = 0.05; // land within 5% to win

export type Direction = "higher" | "lower" | "match";
export type Band = "✅" | "🟩" | "🟨" | "🟧" | "🟥";

// Each warmth band caps how far the guess can be from the true price, measured
// as |guess - actual| / actual. Ordered warm → cold; 🟥 is the catch-all and
// carries no upper bound (being told "red" tells you nothing about how far off
// you are). `narrowBounds` reuses these same caps to squeeze the slider range,
// so the emoji you see and the range you get can never drift apart.
const BANDS: { band: Exclude<Band, "✅">; maxPct: number }[] = [
  { band: "🟩", maxPct: 0.12 },
  { band: "🟨", maxPct: 0.25 },
  { band: "🟧", maxPct: 0.45 },
  { band: "🟥", maxPct: Infinity },
];

// Feedback for a single guess that does NOT reveal the price: which way to move
// and how warm you are. `higher` means the true price is above your guess.
// Bands escalate from bad → nailed it: 🟥 red, 🟧 orange, 🟨 yellow, 🟩 green,
// ✅ within the win threshold.
export function feedback(guess: number, actual: number): {
  direction: Direction;
  band: Band;
  within: boolean;
} {
  const absPct = Math.abs(guess - actual) / actual;
  const within = absPct <= WIN_THRESHOLD;
  const direction: Direction = within ? "match" : guess < actual ? "higher" : "lower";
  const band: Band = within ? "✅" : BANDS.find((b) => absPct <= b.maxPct)!.band;
  return { direction, band, within };
}

// Squeeze the [lo, hi] slider range after a guess. The direction sets the near
// bound to the guess (you now know which side the price is on), and the band
// sets the far bound: it caps the % error, which bounds how far the true price
// can be. For an under-guess with cap b, (actual - guess)/actual <= b implies
// actual <= guess / (1 - b); symmetrically an over-guess implies
// actual >= guess / (1 + b). 🟥 (maxPct = Infinity) leaves the far bound alone.
export function narrowBounds(
  lo: number,
  hi: number,
  guess: number,
  direction: Direction,
  band: Band,
): { lo: number; hi: number } {
  const maxPct = band === "✅" ? 0 : BANDS.find((b) => b.band === band)!.maxPct;
  if (direction === "higher") {
    const farHi = maxPct < 1 ? guess / (1 - maxPct) : hi;
    return { lo: Math.max(lo, guess), hi: Math.min(hi, farHi) };
  }
  if (direction === "lower") {
    return { lo: Math.max(lo, guess / (1 + maxPct)), hi: Math.min(hi, guess) };
  }
  return { lo, hi };
}

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
