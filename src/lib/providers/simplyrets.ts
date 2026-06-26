import type { Property } from "../types";

// SimplyRETS demo feed. Works out of the box with the public demo credentials
// (simplyrets / simplyrets) — RESO-shaped data including photos, list price,
// beds/baths/sqft/year built. The demo's PRICES ARE RANDOMIZED, so use it for
// wiring/UX only; swap in a real key (or another provider) for true prices.
//
// To point at a real SimplyRETS account or any RESO Web API gateway, set:
//   SIMPLYRETS_BASE_URL, SIMPLYRETS_USER, SIMPLYRETS_PASS
const BASE = process.env.SIMPLYRETS_BASE_URL ?? "https://api.simplyrets.com";
const USER = process.env.SIMPLYRETS_USER ?? "simplyrets";
const PASS = process.env.SIMPLYRETS_PASS ?? "simplyrets";

type RawListing = {
  listingId?: string | number;
  mlsId?: string | number;
  listPrice?: number;
  photos?: string[];
  address?: { city?: string; state?: string; full?: string };
  geo?: { lat?: number; lng?: number };
  property?: {
    bedrooms?: number;
    bathsFull?: number;
    bathsHalf?: number;
    area?: number;
    yearBuilt?: number;
    type?: string;
  };
};

export async function fetchProperties(limit = 50): Promise<Property[]> {
  const auth = Buffer.from(`${USER}:${PASS}`).toString("base64");
  const res = await fetch(`${BASE}/properties?limit=${limit}&status=Active`, {
    headers: { Authorization: `Basic ${auth}` },
    // Cache the upstream pull so play-time requests don't hammer the provider.
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`SimplyRETS request failed: ${res.status} ${res.statusText}`);
  }
  const raw: RawListing[] = await res.json();
  return raw.map(normalize).filter((p): p is Property => p !== null);
}

// Coerce anything that isn't a real number to null, so a malformed feed never
// leaves junk (e.g. an array) in a numeric field where the game expects a number.
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalize(r: RawListing): Property | null {
  const photos = (r.photos ?? []).filter(Boolean);
  // The game is unplayable without a price and at least one photo.
  if (!r.listPrice || photos.length === 0) return null;

  const pr = r.property ?? {};
  const baths = (num(pr.bathsFull) ?? 0) + (num(pr.bathsHalf) ?? 0) * 0.5;

  return {
    id: String(r.listingId ?? r.mlsId ?? photos[0]),
    price: r.listPrice,
    city: r.address?.city ?? "Unknown",
    state: r.address?.state ?? "",
    address: r.address?.full,
    lat: typeof r.geo?.lat === "number" ? r.geo.lat : null,
    lon: typeof r.geo?.lng === "number" ? r.geo.lng : null,
    beds: num(pr.bedrooms),
    baths: baths || null,
    sqft: num(pr.area),
    yearBuilt: num(pr.yearBuilt),
    propertyType: pr.type ?? null,
    photos,
  };
}
