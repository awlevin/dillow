"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { BANDS, WIN_LABEL, type Band } from "@/lib/feedback";
import { usd } from "../_lib/format";
import type { Row } from "../_lib/types";

// The coldest finite cap (🟥) — anything past it is the unbounded ❌.
const COLD_PCT = Math.round((BANDS.find((b) => b.band === "🟥")?.maxPct ?? 3) * 100);

// What a warmth band actually tells you about the guess, in plain English.
function bandBlurb(band: Band): string {
  if (band === "✅") return `Within ${WIN_LABEL} of the price — nailed it!`;
  const cap = BANDS.find((b) => b.band === band);
  if (!cap) return "";
  return Number.isFinite(cap.maxPct)
    ? `You're within ${Math.round(cap.maxPct * 100)}% of the actual price.`
    : `You're more than ${COLD_PCT}% off the actual price.`;
}

export function GuessHistory({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <li key={i} className="animate-rowin flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span className="font-semibold text-stone-700">{usd(r.guess)}</span>
          <span className="flex items-center gap-2 text-stone-500">
            {r.direction === "match" ? "Nailed it" : r.direction === "higher" ? "Higher ↑" : "Lower ↓"}
            <span className="animate-bandpop inline-block text-base">{r.band}</span>
            <BandInfo band={r.band as Band} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// A quiet ⓘ next to each band: tap it for a one-line "you're within X%" — the
// warmth math on demand, rather than always-on copy that clutters the row.
function BandInfo({ band }: { band: Band }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const blurb = bandBlurb(band);
  if (!blurb) return null;

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="What this warmth means"
        aria-expanded={open}
        className={`transition ${open ? "text-stone-500" : "text-stone-300 hover:text-stone-500"}`}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="animate-reveal absolute bottom-full right-0 z-20 mb-1.5 w-max max-w-[13rem] rounded-lg bg-stone-800 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white shadow-lg"
        >
          {blurb}
        </span>
      )}
    </span>
  );
}
