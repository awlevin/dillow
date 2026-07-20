"use client";

import { useEffect, useRef, useState } from "react";
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
          {/* direction is where the REAL price sits relative to the guess, so
              "higher" (price is higher) reads as the guess being too low. */}
          <BandInfo
            band={r.band as Band}
            label={r.direction === "match" ? "Nailed it" : r.direction === "higher" ? "Too low" : "Too high"}
          />
        </li>
      ))}
    </ul>
  );
}

// The whole verdict cluster — "Too low/Too high" plus the band emoji — is the
// info trigger: hover it for a one-line "you're within X%" on desktop, tap it
// on touch — the warmth math on demand, with no extra icon cluttering the row.
// Hover and tap-pin are tracked separately so a desktop click can't cancel its
// own hover, and a tap stays open until the player taps elsewhere.
function BandInfo({ band, label }: { band: Band; label: string }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [pinned]);

  const blurb = bandBlurb(band);
  if (!blurb)
    return (
      <span className="flex items-center gap-2 text-stone-500">
        {label}
        <span className="animate-bandpop inline-block text-base">{band}</span>
      </span>
    );

  const open = hovered || pinned;
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setPinned((p) => !p)}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        aria-label="What this warmth means"
        aria-expanded={open}
        className="flex cursor-help items-center gap-2 text-stone-500"
      >
        {label}
        <span className="animate-bandpop inline-block text-base">{band}</span>
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
