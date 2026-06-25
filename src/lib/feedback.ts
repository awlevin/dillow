// Shared guess feedback rules. Kept separate from game.ts so client UI can
// narrow price bounds without bundling the committed property pool.
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
