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
                <div key={s.category} className="rounded-lg bg-stone-50 px-3 py-2">
                  <p className="text-sm font-semibold text-stone-700">{s.category}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm text-stone-500">
                    {s.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
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
