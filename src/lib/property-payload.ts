import type { Property, PropertyClue } from "./types";
import { toClue } from "./types";
import type { PropertyDetails } from "./property-details";
import { scrubDetails } from "./property-details";
import {
  getGallery,
  getDetails,
  saveGallery,
  saveDetails,
  leaderboardEnabled,
  wasWarmTried,
  markWarmTried,
  WARM_BACKOFF_FAILED,
} from "./leaderboard";
import { fetchDetails } from "./providers/realtor16";
import { archivedDetails, archivedGallery } from "./enrichment-archive";

// The committed snapshot is realtor16-baked, so its galleries + details come from
// realtor16 regardless of the runtime PROPERTY_PROVIDER. Skip the warm when the
// key is absent (e.g. a snapshot-only deploy) so the hot path never throws.
const REALTOR_KEY = process.env.REALTOR_16_RAPID_API_KEY ?? process.env.REALTOR_16_API_KEY;

// Warm (and read) a property's cached gallery + rich details, fetching them from
// realtor16 once on a miss. THE single place runtime enrichment happens, so every
// game mode (daily, rooms) gets the richer gallery and the details modal the same
// way — add a mode and it inherits both for free instead of silently missing them.
async function warm(property: Property): Promise<{ gallery: string[] | null; details: PropertyDetails | null }> {
  let [gallery, details] = await Promise.all([getGallery(property.id), getDetails(property.id)]);
  // Cold-store fallback: the committed archive fills anything Redis doesn't
  // have, so a Redis wipe or a lapsed realtor16 subscription still serves full
  // galleries + details — and a home the archive covers never spends an
  // upstream request.
  gallery ??= archivedGallery(property.id);
  details ??= archivedDetails(property.id);
  if (
    REALTOR_KEY &&
    leaderboardEnabled() &&
    (details === null || gallery === null) &&
    !(await wasWarmTried(property.id))
  ) {
    // Mark BEFORE fetching so concurrent requests can't stampede the provider —
    // un-enrichable listings used to re-fetch on every single page load, which
    // is what made cold rooms crawl. Start with the short (failure) back-off;
    // it's upgraded to the day-long one below once the provider actually
    // answers, so a network blip retries soon instead of sticking for 24h.
    await markWarmTried(property.id, WARM_BACKOFF_FAILED);
    let det: Awaited<ReturnType<typeof fetchDetails>> | undefined;
    try {
      det = await fetchDetails(property.id);
    } catch {
      det = undefined; // transient failure — the short back-off stands
    }
    if (det !== undefined) await markWarmTried(property.id);
    if (det) {
      if (det.photos.length) {
        // Cache even a not-richer gallery so the next read is a hit; consumers
        // only USE it when it beats the snapshot (see below).
        await saveGallery(property.id, det.photos);
        gallery = det.photos;
      }
      if (det.details) {
        await saveDetails(property.id, det.details);
        details = det.details;
      }
    }
  }
  return { gallery, details };
}

export type RoundPayload = {
  clue: PropertyClue & { details?: PropertyDetails }; // pre-guess: enriched gallery + PRICE-SAFE details
  details: PropertyDetails | null; // full (unscrubbed) details, attached once revealed
};

// A property's payload: the price-safe clue shown while guessing (richer gallery +
// scrubbed details), plus the full details to attach to the post-guess reveal.
export async function roundPayload(property: Property): Promise<RoundPayload> {
  const { gallery, details } = await warm(property);
  const enriched = gallery && gallery.length > property.photos.length ? { ...property, photos: gallery } : property;
  const clue = toClue(enriched);
  return {
    clue: details ? { ...clue, details: scrubDetails(details) } : clue,
    details,
  };
}
