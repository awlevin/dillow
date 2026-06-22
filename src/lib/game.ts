import type { Property } from "./types";
import snapshot from "@/data/pool.json";

// ── Property pool (committed snapshot) ───────────────────────────────────────
// Play-time makes ZERO upstream API calls — it reads a snapshot baked at build
// time by POST /api/refresh (which spends one realtor16 request). This keeps the
// ~30 requests/month budget intact and guarantees every player sees the same
// property. Run a refresh to rotate in fresh listings.
const POOL: Property[] = [...(snapshot.properties as Property[])].sort((a, b) =>
  a.id.localeCompare(b.id),
);

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

export function getDailyProperty(key = dayKey()): Property {
  const pool = getPool();
  if (!pool.length) throw new Error("Property pool is empty — run POST /api/refresh");
  return pool[hash(key) % pool.length];
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
export type Band = "🟩" | "🟨" | "🟧" | "🟥" | "⬛";

// Feedback for a single guess that does NOT reveal the price: which way to move
// and how warm you are. `higher` means the true price is above your guess.
export function feedback(guess: number, actual: number): {
  direction: Direction;
  band: Band;
  within: boolean;
} {
  const absPct = Math.abs(guess - actual) / actual;
  const within = absPct <= WIN_THRESHOLD;
  const direction: Direction = within ? "match" : guess < actual ? "higher" : "lower";
  const band: Band =
    absPct <= 0.05 ? "🟩" : absPct <= 0.12 ? "🟨" : absPct <= 0.25 ? "🟧" : absPct <= 0.5 ? "🟥" : "⬛";
  return { direction, band, within };
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
