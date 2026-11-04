import type { Property } from "../types";
import type { DetailSection, PropertyDetails } from "../property-details";
import { stripContactInfo } from "../property-details";

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

// The runtime gallery (warmed once per home, cached in Redis) keeps effectively
// the whole listing's photo set — a richer "study the home" carousel. The
// build-time snapshot stays lean (a cold-start fallback); runtime warming supplies
// the rest. Bounded so a pathological 100-photo mansion can't blow up the payload.
const MAX_GALLERY_PHOTOS = 40;
const SNAPSHOT_PHOTOS = 8;

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

// realtor16 enforces a per-second rate limit (independent of the monthly quota)
// and returns 429 when callers exceed it — common when enriching many listings.
// Retry 429s with exponential backoff so batch enrichment doesn't silently drop
// rate-limited listings. `init` is passed through to fetch (cache, revalidate).
async function rapidFetch(url: URL, key: string, init: RequestInit = {}): Promise<Response> {
  let res!: Response;
  for (let attempt = 0; attempt <= 5; attempt++) {
    res = await fetch(url, {
      ...init,
      headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": key },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); // 0.5s → 16s
  }
  return res;
}

async function fetchOne(location: string, key: string): Promise<Property[]> {
  const url = new URL(`https://${HOST}/search/forsale`);
  url.searchParams.set("location", location);
  url.searchParams.set("limit", String(LIMIT));

  const res = await rapidFetch(url, key, { next: { revalidate: 3600 } });
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
): Promise<{ photos: string[]; yearBuilt: number | null; details: PropertyDetails | null } | null> {
  const key = process.env.REALTOR_16_RAPID_API_KEY ?? process.env.REALTOR_16_API_KEY;
  if (!key) throw new Error("REALTOR_16_RAPID_API_KEY is not set");

  const url = new URL(`https://${HOST}/property/details`);
  url.searchParams.set("property_id", propertyId);
  const res = await rapidFetch(url, key, { cache: "no-store" });
  if (!res.ok) {
    // A 403 here is almost always "You are not subscribed to this API" — the
    // RapidAPI subscription lapsed. Shout AND throw a distinctive error so bulk
    // callers (the pool archive) can abort instead of misfiling every home as
    // "no data"; warm() catches it and just takes the short retry back-off.
    if (res.status === 403) {
      console.error("[realtor16] 403 on details — RapidAPI subscription lapsed? Enrichment is OFF.");
      throw new Error("realtor16: not subscribed (403)");
    }
    return null;
  }

  // RapidAPI occasionally returns a 200 with an empty/non-JSON body (proxy
  // hiccup, rate-limit interstitial); treat that as "no details" rather than
  // letting it throw and bubble up as a 500 with an empty response body.
  const json = await res.json().catch(() => null);
  if (json === null) return null;
  const node = findPhotoNode(json);
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
  // The photo node IS realtor16's `data` object, so the rich detail fields live
  // right alongside the gallery — parse them from the same response (no extra
  // request) so a gallery warm-up doubles as a details warm-up.
  return {
    photos: photos.slice(0, MAX_GALLERY_PHOTOS),
    yearBuilt: typeof yb === "number" ? yb : null,
    details: parseDetails(node as RawDetailNode),
  };
}

// Shape of the realtor16 `data` node we read rich details from. Every numeric
// field can come back as [] for "missing" (same quirk as the search endpoint),
// so num() coerces anything non-numeric to null.
type RawDetailNode = {
  description?: { text?: unknown; lot_sqft?: unknown; stories?: unknown; garage?: unknown };
  details?: Array<{ category?: unknown; parent_category?: unknown; text?: unknown }>;
  price_per_sqft?: unknown;
  list_date?: unknown;
  href?: unknown;
  permalink?: unknown;
};

// realtor16 doesn't carry Zillow/Redfin links (it wraps realtor.com), but its
// permalink is a clean "{street}_{city}_{ST}_{zip}_M{id}" address slug. Drop the
// trailing realtor id and hyphenate it into Zillow's address-search URL. Not a
// verified deep link, but it resolves to the property for real US addresses.
function zillowFromPermalink(permalink: unknown): string | null {
  if (typeof permalink !== "string" || !permalink) return null;
  const slug = permalink.replace(/_M[\dA-Za-z-]+$/i, "").replace(/_/g, "-").trim();
  return slug ? `https://www.zillow.com/homes/${slug}_rb/` : null;
}

function parseDetails(node: RawDetailNode): PropertyDetails {
  const de = node.description ?? {};
  const text = typeof de.text === "string" && de.text.trim() ? de.text.trim() : null;
  const sections: DetailSection[] = (Array.isArray(node.details) ? node.details : [])
    .map((s) => ({
      parent: typeof s?.parent_category === "string" ? s.parent_category : "",
      category: typeof s?.category === "string" ? s.category : "",
      items: (Array.isArray(s?.text) ? s.text : []).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      ),
    }))
    .filter((s) => s.category && s.items.length > 0);
  return stripContactInfo({
    text,
    lotSqft: num(de.lot_sqft),
    stories: num(de.stories),
    garage: num(de.garage),
    pricePerSqft: num(node.price_per_sqft),
    listDate: typeof node.list_date === "string" ? node.list_date.slice(0, 10) : null,
    listingUrl: typeof node.href === "string" && node.href.startsWith("http") ? node.href : null,
    zillowUrl: zillowFromPermalink(node.permalink),
    sections,
  });
}

// Enrich a batch of listings with full galleries — one details request each,
// with bounded concurrency — so the build-time snapshot carries real galleries
// instead of the 1–2 photos the search endpoint returns. Listings that already
// have a full gallery are skipped; failures keep the original photos.
export async function enrichPool(props: Property[], concurrency = 2): Promise<Property[]> {
  const out = [...props];
  let next = 0;
  async function worker() {
    while (next < out.length) {
      const idx = next++;
      const p = out[idx];
      if (p.photos.length >= SNAPSHOT_PHOTOS) continue; // snapshot gallery already full
      try {
        const det = await fetchDetails(p.id);
        if (det && det.photos.length > p.photos.length) {
          // Keep the build-time snapshot lean; the runtime gallery (Redis) carries
          // the full set for the homes that actually get played.
          out[idx] = {
            ...p,
            photos: det.photos.slice(0, SNAPSHOT_PHOTOS),
            yearBuilt: det.yearBuilt ?? p.yearBuilt,
          };
        }
      } catch (err) {
        console.warn(`[realtor16] enrich ${p.id} failed:`, err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, out.length) }, worker));
  return out;
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

// realtor16 returns [] (not null) for a missing numeric field, the same way it
// does for missing strings (see the city/state coercion below). Nullish
// coalescing wouldn't catch [], so it would leak into the snapshot and render as
// a blank "Sq Ft" — coerce anything that isn't a real number to null here.
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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
  const baths = num(d.baths) ?? (d.baths_consolidated ? Number(d.baths_consolidated) : null);

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
    beds: num(d.beds),
    baths: Number.isFinite(baths) ? (baths as number) : null,
    sqft: num(d.sqft),
    yearBuilt: num(d.year_built),
    propertyType: d.type ?? null,
    photos: [...new Set(photos)].slice(0, 6),
  };
}
