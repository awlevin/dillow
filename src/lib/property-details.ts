// Rich, on-demand property details for the "Advanced" modal. Far heavier than the
// snapshot Property (a human description + a dozen categorized feature lists), so
// it's fetched from the provider's details endpoint — the SAME request that warms
// a gallery — and cached in Redis rather than baked into pool.json.
//
// Some of this data leaks the price the player is guessing (price-per-sqft is an
// exact giveaway; tax amounts correlate strongly). scrubDetails() produces the
// price-safe view shown DURING play; the full object is only sent with the reveal.

export type DetailSection = {
  parent: string; // e.g. "Interior", "Exterior"
  category: string; // e.g. "Appliances", "Land Info"
  items: string[]; // human-readable feature strings
};

export type PropertyDetails = {
  text: string | null; // human-written listing description
  lotSqft: number | null;
  stories: number | null;
  garage: number | null; // garage spaces
  pricePerSqft: number | null; // ⚠️ price-revealing — stripped pre-reveal
  listDate: string | null; // YYYY-MM-DD
  listingUrl: string | null; // ⚠️ realtor.com listing page — stripped pre-reveal (shows the price)
  zillowUrl: string | null; // ⚠️ Zillow address-search link (constructed) — stripped pre-reveal
  sections: DetailSection[]; // categorized feature lists
};

// A feature line leaks the price if it quotes a dollar figure / tax / assessed
// value, OR if it lets a player look the listing up and read the price directly —
// a source URL, website, MLS/plan id, or permalink. Everything else (county,
// construction, utilities, schools, etc.) is fair game as a clue.
const LEAKY_LINE =
  /tax amount|tax assessed|assessed value|market value|list price|price per|listing price|original list|\$[\d,]|https?:\/\/|www\.|\bwebsite\b|permalink|source url|\bmls\b|listing id|source plan/i;

// Strip anything from the prose that could reveal or locate the price: a stray
// "$595,000" or a listing URL. realtor.com descriptions rarely include either,
// but this guarantees neither reaches the browser before the guess.
function scrubText(t: string | null): string | null {
  if (t == null) return null;
  const cleaned = t
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\$\s?\d[\d,]*(\.\d+)?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || null;
}

// The price-safe projection shown while the game is still in progress: no
// price-per-sqft, no dollar/tax/assessed lines, no dollar figures in the prose.
export function scrubDetails(d: PropertyDetails): PropertyDetails {
  return {
    ...d,
    pricePerSqft: null,
    listingUrl: null, // the listing pages reveal the price — only sent post-reveal
    zillowUrl: null,
    text: scrubText(d.text),
    sections: d.sections
      .map((s) => ({ ...s, items: s.items.filter((i) => !LEAKY_LINE.test(i)) }))
      .filter((s) => s.items.length > 0),
  };
}

// Some MLS feature lists carry contact details for real people — HOA phone
// lines, a park manager's name or personal email. None of it is a clue, and none
// of it is ours to republish, so it is dropped at ingest (parseDetails), on every
// Redis read (getDetails, for entries cached before this existed), and before
// the cold store is exported (scripts/export-enrichment.mjs).
const CONTACT_LINE = /^[^:]*\b(phone|e-?mail|fax|manager name|agent|contact)\b[^:]*:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const CONTACT_TEXT = /[\w.+-]+@[\w-]+(\.[\w-]+)+|\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

export function stripContactInfo(d: PropertyDetails): PropertyDetails {
  return {
    ...d,
    text: d.text ? d.text.replace(CONTACT_TEXT, "").replace(/\s{2,}/g, " ").trim() || null : d.text,
    sections: d.sections
      .map((s) => ({ ...s, items: s.items.filter((i) => !CONTACT_LINE.test(i)) }))
      .filter((s) => s.items.length > 0),
  };
}
