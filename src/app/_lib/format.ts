import type { Clue } from "./types";

export const MAX_ATTEMPTS = 5;
export const PRICE_MIN = 50_000;
export const PRICE_MAX = 25_000_000;

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Accuracy shown next to a "% off" label: whole numbers at/above 1%, tenths below
// it so near-misses still separate (".1" vs ".2"). Mirrors displayPct() in
// lib/game.ts, which the leaderboard ranks by — keep the 1% rule in sync so the
// board's order always matches the numbers it prints.
export function formatPct(pctError: number): string {
  const pct = Math.abs(pctError) * 100;
  const v = pct < 1 ? Math.round(pct * 10) / 10 : Math.round(pct);
  if (v >= 1) return String(v); // whole number (incl. 0.95% rounding up to 1)
  return v === 0 ? "0" : v.toFixed(1).replace(/^0/, ""); // 0.2 -> ".2"
}

export const compact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : `$${Math.round(n / 1000)}K`;

const TYPE_NAMES: Record<string, string> = {
  single_family: "House",
  multi_family: "Multi-family home",
  condos: "Condo",
  condo: "Condo",
  condo_townhome: "Condo",
  condo_townhome_rowhome_coop: "Condo",
  townhomes: "Townhome",
  townhouse: "Townhome",
  apartment: "Apartment",
  apartments: "Apartment",
  coop: "Co-op",
  duplex_triplex: "Duplex",
  land: "Lot",
  farm: "Farm",
  mobile: "Mobile home",
};

export const typeName = (t: string | null): string | null =>
  !t
    ? null
    : (TYPE_NAMES[t] ??
      t
        .replace(/_/g, " ")
        .replace(/s$/, "")
        .replace(/\b\w/g, (c) => c.toUpperCase()));

export const propertyTitle = (c: Pick<Clue, "propertyType" | "city" | "state">) => {
  const n = typeName(c.propertyType);
  return n ? `${n} in ${c.city}, ${c.state}` : `${c.city}, ${c.state}`;
};

// Round to 3 significant figures so slider values read as "nice" prices.
function niceRound(p: number): number {
  if (p <= 0) return p;
  const mag = Math.pow(10, Math.floor(Math.log10(p)) - 2);
  return Math.round(p / mag) * mag;
}

// Log-scale position (0..1) → price, so each slider step is proportional.
export function tToPrice(t: number, lo: number, hi: number): number {
  return niceRound(Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * t));
}

export const digitsOnly = (value: string) => value.replace(/[^0-9]/g, "");

// Parse a typed price into a number, tolerating commas and a single decimal
// point (so "1.2" → 1.2, ready to be scaled by a K/M unit button).
export const parsePriceInput = (value: string) => Number(value.replace(/[^0-9.]/g, "")) || 0;

// Format a typed price for display: group the integer part with commas while
// preserving an in-progress decimal (e.g. "1.", "1.2") so the user can type
// "1.2" and then tap M. Only the first decimal point is kept.
export function formatPriceInput(value: string) {
  let cleaned = value.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) {
    // Drop any decimal points after the first.
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  }
  if (!cleaned) return "";
  const [intPart, decPart] = cleaned.split(".");
  const intFmt = intPart ? Number(intPart).toLocaleString() : "0";
  return cleaned.includes(".") ? `${intFmt}.${decPart}` : intFmt;
}
