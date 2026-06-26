"use client";

import { useEffect, useState } from "react";
import type { PropertyDetails } from "@/lib/property-details";
import { usd } from "../_lib/format";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-05-20" → "May 2026" without constructing a Date (avoids any TZ surprises).
function formatListed(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : null;
}

function formatLot(sqft: number | null): string | null {
  if (sqft == null) return null;
  if (sqft >= 21780) return `${(sqft / 43560).toFixed(2)} acre lot`; // ≥ ½ acre reads better in acres
  return `${sqft.toLocaleString()} sq ft lot`;
}

// realtor16's feature strings are raw enum-ish tokens — "BedroomOnMainLevel",
// "CentralAir", "PublicSewer". Split camelCase / PascalCase / snake_case into
// words and lowercase the little joiners so they read like prose.
const JOINERS = new Set(["and", "or", "the", "of", "to", "on", "in", "with", "a"]);
function humanize(token: string): string {
  // A long decimal (lot-size acres, etc.) reads better rounded than as 0.1772957.
  const t = token.trim();
  if (/^\d+\.\d{3,}$/.test(t)) return String(Math.round(parseFloat(t) * 100) / 100);
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
  revealed,
  onClose,
}: {
  details: PropertyDetails;
  revealed: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 320); // let the exit animation finish before unmounting
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const facts = [
    formatLot(details.lotSqft),
    details.stories != null ? `${details.stories} ${details.stories === 1 ? "story" : "stories"}` : null,
    details.garage != null ? `${details.garage}-car garage` : null,
    formatListed(details.listDate) && `Listed ${formatListed(details.listDate)}`,
    details.pricePerSqft != null ? `${usd(details.pricePerSqft)}/sq ft` : null,
  ].filter((f): f is string => Boolean(f));

  // Group the categorized feature lists under their parent ("Interior", etc.).
  const groups = new Map<string, typeof details.sections>();
  for (const s of details.sections) {
    const key = s.parent || "Other";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center ${
        closing ? "animate-modalfadeout" : "animate-modalfade"
      }`}
      onClick={dismiss}
    >
      <div
        className={`relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${
          closing ? "animate-modalpopout" : "animate-modalpop"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Property details"
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 text-xl text-stone-400 transition hover:text-stone-700"
        >
          ✕
        </button>

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

        {details.text && (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-stone-600">
            {details.text}
          </p>
        )}

        {[...groups].map(([parent, sections]) => (
          <div key={parent} className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">{parent}</p>
            <div className="mt-2 flex flex-col gap-2.5">
              {sections.map((s) => (
                <FeatureSection key={s.category} category={s.category} items={s.items} />
              ))}
            </div>
          </div>
        ))}

        {!revealed && (
          <p className="mt-5 text-center text-xs text-stone-400">
            Price-related details stay hidden until you finish.
          </p>
        )}
      </div>
    </div>
  );
}
