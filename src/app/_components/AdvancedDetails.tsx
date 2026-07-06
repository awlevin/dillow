"use client";

import type { PropertyDetails } from "@/lib/property-details";
import { usd } from "../_lib/format";
import { Modal } from "./Modal";
import { ReportProperty } from "./ReportProperty";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-05-20" → "May 2026" without constructing a Date (avoids any TZ surprises).
export function formatListed(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

export function formatLot(sqft: number | null): string | null {
  if (sqft == null) return null;
  if (sqft >= 21780) return `${(sqft / 43560).toFixed(2)} acre lot`; // ≥ ½ acre reads better in acres
  return `${sqft.toLocaleString()} sq ft lot`;
}

// The Tier-1 "home facts" — lot size and listed date — shared by the modal's chip
// row and the unlock strip's teaser so the copy never drifts. These are price-safe
// (unlike pricePerSqft, which the server only sends post-reveal).
export function homeFacts(details: PropertyDetails): string[] {
  const listed = formatListed(details.listDate);
  // Stories and garage-car count are intentionally omitted: the first photo is an
  // exterior that almost always shows them, so they add nothing as a paid clue.
  return [formatLot(details.lotSqft), listed && `Listed ${listed}`].filter((f): f is string => Boolean(f));
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

// A stone-toned placeholder for content that a later guess will unlock, shown in
// the exact spot the real content will appear. `tier` is 1-based and matches the
// guess that unlocks it (Tier 2 → "after your 2nd guess").
function LockedRow({ label, tier }: { label: string; tier: number }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2.5 text-sm text-stone-400">
      <span aria-hidden="true">🔒</span>
      <span>
        {label} — unlocks after your {ORDINALS[tier - 1] ?? `${tier}th`} guess
      </span>
    </div>
  );
}

// realtor16's feature strings are raw enum-ish tokens — "BedroomOnMainLevel",
// "CentralAir", "PublicSewer". Split camelCase / PascalCase / snake_case into
// words and lowercase the little joiners so they read like prose.
const JOINERS = new Set(["and", "or", "the", "of", "to", "on", "in", "with", "a"]);
function humanize(token: string): string {
  const t = token.trim();
  // Tidy plain numbers: drop trailing-zero decimals (2.00 → 2, 2.50 → 2.5) and
  // round long ones (0.1772957 → 0.18). Integers pass through unchanged.
  if (/^-?\d+(\.\d+)?$/.test(t)) return String(Math.round(parseFloat(t) * 100) / 100);
  return t
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // fooBar → foo Bar
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // ABCDef → ABC Def
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w, i) => (i > 0 && JOINERS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(" ");
}

// Split a feature section's raw lines into bare amenities (rendered as chips) and
// "Label: Value" attributes (rendered as a spec-sheet). Drops pure "Yes/No" lines:
// a "No" is noise, and a "Heating: Yes" becomes a "Heating" chip so nothing is lost.
function parseItems(items: string[]): { chips: string[]; specs: { label: string; value: string }[] } {
  const chips: string[] = [];
  const specs: { label: string; value: string }[] = [];
  for (const raw of items) {
    if (/https?:\/\/|www\./i.test(raw)) continue; // raw listing URLs read as clutter
    const sep = raw.indexOf(":");
    if (sep === -1) {
      chips.push(humanize(raw));
      continue;
    }
    const label = raw.slice(0, sep).trim();
    const value = raw.slice(sep + 1).trim();
    if (/^no$/i.test(value)) continue; // a feature that's absent isn't worth a row
    if (/^yes$/i.test(value)) {
      chips.push(humanize(label.replace(/ features$/i, "")));
      continue;
    }
    const cleanLabel = humanize(label.replace(/ features$/i, "")); // "Cooling Features" → "Cooling"
    const cleanValue = value
      .split(",")
      .map((v) => humanize(v.trim()))
      .filter(Boolean)
      .join(", ");
    specs.push({ label: cleanLabel, value: cleanValue });
  }
  return { chips, specs };
}

function FeatureSection({ category, items }: { category: string; items: string[] }) {
  const { chips, specs } = parseItems(items);
  if (!chips.length && !specs.length) return null;
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2.5">
      <p className="text-sm font-semibold text-stone-700">{category}</p>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span key={i} className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-600 ring-1 ring-stone-200">
              {c}
            </span>
          ))}
        </div>
      )}
      {specs.length > 0 && (
        <dl className={`flex flex-col gap-1 text-sm ${chips.length ? "mt-2" : "mt-1.5"}`}>
          {specs.map((s, i) => (
            <div key={i} className="flex justify-between gap-4">
              <dt className="shrink-0 text-stone-400">{s.label}</dt>
              <dd className="text-right text-stone-700">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function AdvancedDetails({
  details,
  propertyId,
  revealed,
  unlockedTiers,
  onClose,
}: {
  details: PropertyDetails;
  propertyId: string;
  revealed: boolean;
  // How many clue tiers are unlocked so far (rows.length while live; Infinity once
  // revealed). Tier 1 = home facts, 2 = description, 3 = feature sections.
  unlockedTiers: number;
  onClose: () => void;
}) {
  // Home facts (Tier 1) stay hidden until the first guess; pricePerSqft is
  // price-revealing and only ever arrives post-reveal.
  const hf = homeFacts(details);
  const factsUnlocked = unlockedTiers >= 1;
  const facts = [
    ...(factsUnlocked ? hf : []),
    details.pricePerSqft != null ? `${usd(details.pricePerSqft)}/sq ft` : null,
  ].filter((f): f is string => Boolean(f));

  // Group the categorized feature lists under their parent ("Interior", etc.).
  const groups = new Map<string, typeof details.sections>();
  for (const s of details.sections) {
    const key = s.parent || "Other";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  return (
    <Modal onClose={onClose} label="Property details" maxWidth="lg">
      {() => (
        <>
          <h2 className="text-2xl font-black text-emerald-900">Property details</h2>

        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span
                key={f}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
              >
                {f}
              </span>
            ))}
          </div>
        )}
        {!factsUnlocked && hf.length > 0 && <LockedRow label="Home facts" tier={1} />}

        {unlockedTiers >= 2
          ? details.text && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-stone-600">
                {details.text}
              </p>
            )
          : details.text && <LockedRow label="Listing description" tier={2} />}

        {unlockedTiers >= 3
          ? [...groups].map(([parent, sections]) => (
              <div key={parent} className="mt-5">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{parent}</p>
                <div className="mt-2 flex flex-col gap-2.5">
                  {sections.map((s) => (
                    <FeatureSection key={s.category} category={s.category} items={s.items} />
                  ))}
                </div>
              </div>
            ))
          : details.sections.length > 0 && <LockedRow label="Full feature list" tier={3} />}

        {!revealed && (
          <p className="mt-5 text-center text-xs text-stone-400">
            Price-related details stay hidden until you finish.
          </p>
        )}

          <ReportProperty propertyId={propertyId} className="mt-5 justify-center" />
        </>
      )}
    </Modal>
  );
}
