import type { Property, PropertyClue } from "./types";
import { toClue } from "./types";
import type { PropertyDetails } from "./property-details";
import { scrubDetails } from "./property-details";
import { getGallery, getDetails, saveGallery, saveDetails, leaderboardEnabled } from "./leaderboard";
import { fetchDetails } from "./providers/realtor16";

// The committed snapshot is realtor16-baked, so its galleries + details come from
// realtor16 regardless of the runtime PROPERTY_PROVIDER. Skip the warm when the
// key is absent (e.g. a snapshot-only deploy) so the hot path never throws.
const REALTOR_KEY = process.env.REALTOR_16_RAPID_API_KEY ?? process.env.REALTOR_16_API_KEY;

// Warm (and read) a property's cached gallery + rich details, fetching them from
// realtor16 once on a miss. THE single place runtime enrichment happens, so every
// game mode (daily, rooms) gets the richer gallery and the details modal the same
// way — add a mode and it inherits both for free instead of silently missing them.
async function warm(property: Property): Promise<{ gallery: string[] | null; details: PropertyDetails | null }> {
  let gallery = await getGallery(property.id);
  let details = await getDetails(property.id);
  if (REALTOR_KEY && leaderboardEnabled() && (details === null || gallery === null)) {
    const det = await fetchDetails(property.id);
    if (det) {
      if (det.photos.length > property.photos.length) {
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
