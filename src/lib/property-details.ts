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
  sections: DetailSection[]; // categorized feature lists
};

// A feature line leaks the price if it quotes a dollar figure, a tax amount, or an
// assessed / market value. Everything else (county, construction, utilities, etc.)
// is fair game as a clue.
const LEAKY_LINE =
  /tax amount|tax assessed|assessed value|market value|list price|price per|listing price|original list|\$[\d,]/i;

// Strip any dollar figure that might appear in prose. realtor.com descriptions
// rarely quote the asking price, but a stray "$595,000" would hand it over.
function scrubText(t: string | null): string | null {
  if (t == null) return null;
  const cleaned = t.replace(/\$\s?\d[\d,]*(\.\d+)?/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || null;
}

// The price-safe projection shown while the game is still in progress: no
// price-per-sqft, no dollar/tax/assessed lines, no dollar figures in the prose.
export function scrubDetails(d: PropertyDetails): PropertyDetails {
  return {
    ...d,
    pricePerSqft: null,
    text: scrubText(d.text),
    sections: d.sections
      .map((s) => ({ ...s, items: s.items.filter((i) => !LEAKY_LINE.test(i)) }))
      .filter((s) => s.items.length > 0),
  };
}
