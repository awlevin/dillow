import type { SlotKind } from "./types";

// How each of the day's three homes presents itself. Honest labels: the "local"
// home is only ever called "near you" when we actually placed the player; when we
// couldn't, it's a wildcard and says so.
export type HomeMeta = {
  label: string; // short chip label, e.g. for the slot navigator
  emoji: string;
  blurb: string; // one-line framing shown above the home
};

const META: Record<SlotKind, HomeMeta> = {
  standard: { label: "Home of the day", emoji: "🏡", blurb: "Today's home." },
  premium: { label: "Big spender", emoji: "💰", blurb: "Something at the very top of the market." },
  local: { label: "Near you", emoji: "📍", blurb: "A home close to where you are." },
  wildcard: { label: "Wildcard", emoji: "🃏", blurb: "A wildcard pick from across the map." },
};

export function homeMeta(kind: SlotKind): HomeMeta {
  return META[kind] ?? META.wildcard;
}
