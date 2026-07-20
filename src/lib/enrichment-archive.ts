import archive from "@/data/enrichment.json";
import type { PropertyDetails } from "./property-details";

// The committed cold store of runtime enrichment — galleries + rich details
// exported from Redis by scripts/export-enrichment.mjs. Git is the tier that
// survives everything: a Redis wipe, a lapsed realtor16 subscription, a fresh
// deploy. Consumed by warm() (property-payload) as the middle tier between the
// Redis cache and a live provider fetch.
type Archive = {
  exportedAt: string;
  galleries: Record<string, string[]>;
  details: Record<string, PropertyDetails>;
};

const A = archive as unknown as Archive;

export function archivedGallery(id: string): string[] | null {
  return A.galleries[id] ?? null;
}

export function archivedDetails(id: string): PropertyDetails | null {
  return A.details[id] ?? null;
}
