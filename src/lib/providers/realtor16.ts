import type { Property } from "../types";

// realtor16 (RapidAPI, by s.mahmoud97) — wraps realtor.com listings: real list
// prices, photos, and coordinates. Requires a RapidAPI subscription to realtor16
// (Basic/free is enough). Each location below costs ONE request, so the default
// city list is deliberately small to respect tight monthly request budgets.
//
// Env:
//   REALTOR_16_RAPID_API_KEY  RapidAPI key (required; REALTOR_16_API_KEY also accepted)
//   REALTOR16_LOCATIONS       comma-separated "City, ST" list (overrides default)
//   REALTOR16_LIMIT           listings per location (default 50)
const HOST = "realtor16.p.rapidapi.com";

// A geographically + price diverse spread of US metros for nationwide variety.
const DEFAULT_LOCATIONS = [
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Miami, FL",
  "Seattle, WA",
  "Denver, CO",
  "Atlanta, GA",
  "Nashville, TN",
  "Phoenix, AZ",
  "Boston, MA",
  "Detroit, MI",
];

const LOCATIONS =
  process.env.REALTOR16_LOCATIONS?.split(",").map((s) => s.trim()).filter(Boolean) ??
  DEFAULT_LOCATIONS;
const LIMIT = Number(process.env.REALTOR16_LIMIT ?? 50);

export const locationCount = LOCATIONS.length;

type RawResult = {
  property_id?: string | number;
  listing_id?: string | number;
  list_price?: number;
  price?: number;
  location?: {
    address?: {
      city?: string;
      state_code?: string;
      state?: string;
      line?: string;
      coordinate?: { lat?: number; lon?: number };
    };
  };
  description?: {
    beds?: number;
    baths?: number;
    baths_consolidated?: string;
    sqft?: number;
    year_built?: number;
    type?: string;
  };
  primary_photo?: { href?: string };
  photos?: Array<{ href?: string }>;
};

export async function fetchProperties(): Promise<Property[]> {
  const key = process.env.REALTOR_16_RAPID_API_KEY ?? process.env.REALTOR_16_API_KEY;
  if (!key) throw new Error("REALTOR_16_RAPID_API_KEY is not set");

  const all: Property[] = [];
  for (const location of LOCATIONS) {
    try {
      all.push(...(await fetchOne(location, key)));
    } catch (err) {
      console.warn(`[realtor16] ${location} failed:`, err);
    }
  }
  // Dedupe by id (a listing can surface in overlapping searches).
  const seen = new Set<string>();
  return all.filter((p) => !seen.has(p.id) && (seen.add(p.id), true));
}

async function fetchOne(location: string, key: string): Promise<Property[]> {
  const url = new URL(`https://${HOST}/search/forsale`);
  url.searchParams.set("location", location);
  url.searchParams.set("limit", String(LIMIT));

  const res = await fetch(url, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key },
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`realtor16 ${res.status} ${res.statusText} ${body}`.trim());
  }
  const json = await res.json();
  return extractResults(json).map(normalize).filter((p): p is Property => p !== null);
}

// Full photo gallery (interiors) + year_built for one listing. ONE request each,
// so callers should use it sparingly (e.g. only for upcoming featured listings).
export async function fetchDetails(
  propertyId: string,
): Promise<{ photos: string[]; yearBuilt: number | null } | null> {
  const key = process.env.REALTOR_16_RAPID_API_KEY ?? process.env.REALTOR_16_API_KEY;
  if (!key) throw new Error("REALTOR_16_RAPID_API_KEY is not set");

  const url = new URL(`https://${HOST}/property/details`);
  url.searchParams.set("property_id", propertyId);
  const res = await fetch(url, {
    headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const node = findPhotoNode(await res.json());
  if (!node) return null;
  const photos = [
    ...new Set(
      (node.photos ?? [])
        .map((p) => p?.href)
        .filter((h): h is string => Boolean(h))
        .map(hiRes),
    ),
  ];
  const yb = node.description?.year_built;
  return { photos: photos.slice(0, 8), yearBuilt: typeof yb === "number" ? yb : null };
}

// Find the nested object that holds a non-empty photos array.
function findPhotoNode(
  o: unknown,
): { photos?: Array<{ href?: string }>; description?: { year_built?: number } } | null {
  if (Array.isArray(o)) {
    for (const x of o) {
      const r = findPhotoNode(x);
      if (r) return r;
    }
  } else if (o && typeof o === "object") {
    const obj = o as Record<string, unknown>;
    if (Array.isArray(obj.photos) && obj.photos.length) {
      return obj as { photos?: Array<{ href?: string }>; description?: { year_built?: number } };
    }
    for (const v of Object.values(obj)) {
      const r = findPhotoNode(v);
      if (r) return r;
    }
  }
  return null;
}

function extractResults(json: unknown): RawResult[] {
  const j = json as Record<string, unknown>;
  const candidates = [
    j?.properties,
    (j?.home_search as { results?: unknown })?.results,
    ((j?.data as Record<string, unknown>)?.home_search as { results?: unknown })?.results,
    j?.results,
    j?.listings,
  ];
  return (candidates.find((c) => Array.isArray(c)) as RawResult[]) ?? [];
}

// realtor.com rdcpix thumbnails end in "...{digits}s.jpg" (~200px, blurry on a
// card). Swap the trailing "s" size token for "od" (original) for a sharp image.
function hiRes(url: string): string {
  return url.replace(/(\d)s\.jpg$/i, "$1od.jpg");
}

function normalize(r: RawResult): Property | null {
  const photos = [r.primary_photo?.href, ...(r.photos ?? []).map((p) => p?.href)]
    .filter((x): x is string => Boolean(x))
    .map(hiRes);

  const rawPrice: unknown = r.list_price ?? r.price;
  const price = typeof rawPrice === "number" && rawPrice > 0 ? rawPrice : null;
  if (price === null || photos.length === 0) return null;

  const d = r.description ?? {};
  const addr = r.location?.address ?? {};
  const coord = addr.coordinate;
  const baths = d.baths ?? (d.baths_consolidated ? Number(d.baths_consolidated) : null);

  // realtor16 occasionally returns [] for a missing field — coerce to string.
  const city = typeof addr.city === "string" ? addr.city : null;
  const state =
    typeof addr.state_code === "string"
      ? addr.state_code
      : typeof addr.state === "string"
        ? addr.state
        : "";
  if (!city) return null; // a clue with no city isn't playable

  return {
    id: String(r.property_id ?? r.listing_id ?? photos[0]),
    price,
    city,
    state,
    address: addr.line,
    lat: typeof coord?.lat === "number" ? coord.lat : null,
    lon: typeof coord?.lon === "number" ? coord.lon : null,
    beds: d.beds ?? null,
    baths: Number.isFinite(baths) ? (baths as number) : null,
    sqft: d.sqft ?? null,
    yearBuilt: d.year_built ?? null,
    propertyType: d.type ?? null,
    photos: [...new Set(photos)].slice(0, 6),
  };
}
