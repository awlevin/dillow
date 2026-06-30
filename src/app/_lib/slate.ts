import type { SlotKind } from "./types";

// How each of the day's three homes presents itself. Honest labels: the "local"
// home is only ever called "near you" when we actually placed the player; when we
// couldn't, it's a wildcard and says so. Used in the end-of-day recap and share text.
export type HomeMeta = {
  label: string;
  emoji: string;
};

const META: Record<SlotKind, HomeMeta> = {
  standard: { label: "Home of the day", emoji: "🏡" },
  premium: { label: "Big spender", emoji: "💰" },
  local: { label: "Near you", emoji: "📍" },
  wildcard: { label: "Wildcard", emoji: "🃏" },
};

export function homeMeta(kind: SlotKind): HomeMeta {
  return META[kind] ?? META.wildcard;
}
