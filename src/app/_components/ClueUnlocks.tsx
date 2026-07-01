"use client";

import type { PropertyDetails } from "@/lib/property-details";
import { homeFacts } from "./AdvancedDetails";

// What the guess that just landed unlocked, phrased for the strip teaser. `tier`
// is 1-based and equals the number of guesses made: 1 → home facts, 2 → the
// listing description, 3 → the feature sections. Returns null when that tier has
// no content (or there is no such tier), so we never tease an empty unlock.
function teaserFor(details: PropertyDetails, tier: number): string | null {
  if (tier === 1) {
    const facts = homeFacts(details);
    return facts.length ? facts.join(" · ") : null;
  }
  if (tier === 2) return details.text ? "the listing description" : null;
  if (tier === 3) return details.sections.length ? "the full feature list" : null;
  return null;
}

// A quiet single-line strip that sits between the guess history and the controls
// while a home is live. Before the first guess it hints that clues are coming;
// after each guess it surfaces the freshly-unlocked clue as a tappable pill that
// opens the details modal. Only rendered when the (scrubbed) clue details exist.
export function ClueUnlocks({
  details,
  guessCount,
  onOpen,
}: {
  details: PropertyDetails;
  guessCount: number;
  onOpen: () => void;
}) {
  if (guessCount === 0) {
    return (
      <button
        onClick={onOpen}
        className="self-center text-xs text-stone-400 transition hover:text-stone-600"
      >
        More clues unlock with each guess
      </button>
    );
  }

  const teaser = teaserFor(details, guessCount);
  if (!teaser) return null;

  return (
    // Keyed by the guess count so the row re-mounts (and re-animates) on each new unlock.
    <button
      key={guessCount}
      onClick={onOpen}
      className="animate-rowin flex w-full items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
    >
      <span className="shrink-0" aria-hidden="true">
        🔓
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">New clue</span> — {teaser}
      </span>
    </button>
  );
}
