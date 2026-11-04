// Shared guess feedback rules. Kept separate from game.ts so client UI can
// narrow price bounds without bundling the property pool.
export const WIN_THRESHOLD = 0.001; // land within 0.1% to win
// The threshold as copy. Every surface that names the win bar uses this label,
// so changing the threshold above can't leave stale percentages behind.
export const WIN_LABEL = "0.1%";

export type Direction = "higher" | "lower" | "match";
export type Band = "✅" | "🟩" | "🟨" | "🟧" | "🟥" | "❌";

// Each warmth band caps how far the guess can be from the true price, measured
// as |guess - actual| / actual. Ordered warm → cold; ❌ is the catch-all and
// carries no upper bound (being told "way off" tells you nothing about how far
// off you are). `narrowBounds` reuses these same caps to squeeze the slider
// range, so the emoji you see and the range you get can never drift apart.
export const BANDS: { band: Exclude<Band, "✅">; maxPct: number }[] = [
  { band: "🟩", maxPct: 0.1 },       // GREEN: within 10%
  { band: "🟨", maxPct: 0.5 },       // YELLOW: within 50%
  { band: "🟧", maxPct: 1 },         // ORANGE: within 100%
  { band: "🟥", maxPct: 3 },         // RED: within 300%
  { band: "❌", maxPct: Infinity },  // WAY OFF: more than 300%
];

// The full warmth ladder as contiguous error windows, nailed-it → cold. Each
// row owns guesses whose % error falls in [loPct, hiPct]. Derived from the same
// WIN_THRESHOLD + BANDS above, so it can't drift from what `feedback()` returns.
export type BandRow = { band: Band; loPct: number; hiPct: number };
export const BAND_LADDER: BandRow[] = (() => {
  const rows: BandRow[] = [{ band: "✅", loPct: 0, hiPct: WIN_THRESHOLD }];
  let lo = WIN_THRESHOLD;
  for (const b of BANDS) {
    rows.push({ band: b.band, loPct: lo, hiPct: b.maxPct });
    lo = b.maxPct;
  }
  return rows;
})();

// For a target price, the dollar guess-window a ladder row covers on each side.
// Over-guessing is unbounded, but an under-guess can't exceed 100% error (a $0
// guess), so rows with loPct >= 1 are unreachable from below — `below` is null.
export function bandWindows(
  price: number,
  row: BandRow,
): { above: { lo: number; hi: number }; below: { lo: number; hi: number } | null } {
  const above = { lo: price * (1 + row.loPct), hi: price * (1 + row.hiPct) };
  const below =
    row.loPct >= 1
      ? null
      : { lo: Math.max(0, price * (1 - row.hiPct)), hi: price * (1 - row.loPct) };
  return { above, below };
}

// Feedback for a single guess that does NOT reveal the price: which way to move
// and how warm you are. `higher` means the true price is above your guess.
// Bands escalate from bad → nailed it: ❌ way off, 🟥 red, 🟧 orange, 🟨 yellow,
// 🟩 green, ✅ within the win threshold.
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
// actual >= guess / (1 + b). ❌ (maxPct = Infinity) leaves the far bound alone.
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
