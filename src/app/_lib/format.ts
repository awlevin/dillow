import type { Clue } from "./types";

export const MAX_ATTEMPTS = 5;
export const PRICE_MIN = 50_000;
export const PRICE_MAX = 25_000_000;

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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

export const parsePriceInput = (value: string) => Number(digitsOnly(value)) || 0;

export function formatPriceInput(value: string) {
  const digits = digitsOnly(value);
  return digits ? Number(digits).toLocaleString() : "";
}
