"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pencil } from "lucide-react";
import { BANDS, narrowBounds, type Band } from "@/lib/feedback";
import type { Row } from "../_lib/types";
import { compact, formatPriceInput, MAX_ATTEMPTS, usd } from "../_lib/format";

type GuessControlsProps = {
  rows: Row[];
  remaining: number;
  guessValue: number;
  lo: number;
  hi: number;
  t: number;
  exactMode: boolean;
  exact: string;
  submitting: boolean;
  error: string | null;
  onSliderChange: (value: number) => void;
  onExactModeChange: (enabled: boolean) => void;
  onExactChange: (value: string) => void;
  onApplyUnit: (mult: number) => void;
  onSubmit: () => void;
};

// iOS-scrub feel: vertical distance from the track scales horizontal sensitivity
// down from 1:1 at the track to ~0.1x once the finger is ~150px above/below.
const FINE_SCRUB_RANGE = 150;
const sensitivityFor = (dy: number) => 1 - 0.9 * Math.min(Math.abs(dy) / FINE_SCRUB_RANGE, 1);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type BoundSource = { guess: number; band: Band; pct: number };

// Re-derive which guess pinned each current bound, keeping a source only when a
// band's %-cap — not the raw guess value — set it (that's the case that reads as
// "the range doesn't match my guess"). narrowBounds only ever tightens, so the
// last guess to move a side is the one that set it; we replay from wide sentinels
// and trust a source only if it actually reached the current (prop) bound — if
// the initial floor/ceiling is tighter, no guess explains that side.
function boundSources(rows: Row[], lo: number, hi: number): { lo: BoundSource | null; hi: BoundSource | null } {
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 1e-6);
  let curLo = 0;
  let curHi = Infinity;
  let loSrc: BoundSource | null = null;
  let hiSrc: BoundSource | null = null;
  for (const r of rows) {
    const band = r.band as Band;
    const cap = BANDS.find((b) => b.band === band);
    const next = narrowBounds(curLo, curHi, r.guess, r.direction, band);
    // A raw guess pinning a bound reads fine on its own — only tag band caps.
    if (next.lo > curLo) loSrc = cap && !near(next.lo, r.guess) ? { guess: r.guess, band, pct: cap.maxPct } : null;
    if (next.hi < curHi) hiSrc = cap && !near(next.hi, r.guess) ? { guess: r.guess, band, pct: cap.maxPct } : null;
    curLo = next.lo;
    curHi = next.hi;
  }
  return {
    lo: loSrc && near(curLo, lo) ? loSrc : null,
    hi: hiSrc && near(curHi, hi) ? hiSrc : null,
  };
}

const pctLabel = (pct: number) => `${Math.round(pct * 100)}%`;

export function GuessControls({
  rows,
  remaining,
  guessValue,
  lo,
  hi,
  t,
  exactMode,
  exact,
  submitting,
  error,
  onSliderChange,
  onExactModeChange,
  onExactChange,
  onApplyUnit,
  onSubmit,
}: GuessControlsProps) {
  const rowCount = rows.length;
  const src = boundSources(rows, lo, hi);

  // Fine-scrub drag state. The native range input stays for layout, styling,
  // keyboard, and desktop mouse/pen (all unchanged 1:1); on touch we take over.
  const drag = useRef<{ lastX: number; startY: number; t: number; width: number } | null>(null);
  const [sensitivity, setSensitivity] = useState<number | null>(null);
  const hintShown = useRef(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHint, setShowHint] = useState(false);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (e.pointerType !== "touch") return; // mouse & pen keep the native slider
    e.preventDefault(); // stop the native thumb from also jumping to the touch
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { lastX: e.clientX, startY: e.clientY, t, width: e.currentTarget.getBoundingClientRect().width };
    setSensitivity(1);
    if (!hintShown.current) {
      hintShown.current = true;
      setShowHint(true);
      hintTimer.current = setTimeout(() => setShowHint(false), 2600);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLInputElement>) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const s = sensitivityFor(e.clientY - d.startY);
    const dx = e.clientX - d.lastX;
    d.lastX = e.clientX;
    // Integrate deltas (not total offset) so easing changes never snap the value.
    d.t = clamp01(d.t + (dx * s) / (d.width || 1));
    setSensitivity(s);
    onSliderChange(d.t);
  };

  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setSensitivity(null);
  };

  const scrubChip =
    sensitivity != null && sensitivity < 0.9
      ? `fine-tuning ×${sensitivity.toFixed(2)}`
      : showHint
        ? "slide up for fine control"
        : null;

  return (
    <div className="mt-1 flex flex-col gap-2 sm:gap-3">
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
        <p className="text-center text-[11px] font-medium uppercase tracking-wide text-stone-400">
          {rowCount === 0 ? "Drag, or tap Guess to start in the middle" : "Higher or lower?"}
        </p>
        {!exactMode ? (
          <>
            <div className="relative flex items-center justify-center">
              <p className="text-2xl font-black tracking-tight text-emerald-800 sm:text-3xl">{usd(guessValue)}</p>
              <button
                type="button"
                onClick={() => onExactModeChange(true)}
                aria-label="Type an exact price"
                title="Type an exact price"
                className="absolute right-0 rounded-md p-1 text-emerald-600 transition hover:bg-stone-200/60 hover:text-emerald-700"
              >
                <Pencil size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="relative mt-2 sm:mt-3">
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(t * 1000)}
                onChange={(e) => onSliderChange(Number(e.target.value) / 1000)}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                className="h-2 w-full cursor-pointer touch-none accent-emerald-600"
                aria-label="Price guess"
              />
              {scrubChip && (
                <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-stone-200 bg-white/90 px-2 py-0.5 text-[11px] text-stone-400 shadow-sm">
                  {scrubChip}
                </span>
              )}
            </div>
            <div className="flex justify-between text-xs text-stone-400">
              <span>
                {src.lo && <span aria-hidden="true">{src.lo.band} </span>}
                {compact(lo)}
              </span>
              <span>
                {src.hi && <span aria-hidden="true">{src.hi.band} </span>}
                {compact(hi)}
              </span>
            </div>
            {(src.lo || src.hi) && (
              <div className="mt-1 space-y-0.5">
                {src.lo && (
                  <p className="text-[11px] leading-snug text-stone-400">
                    {src.lo.band} at {compact(src.lo.guess)} means the price is within {pctLabel(src.lo.pct)} of it —
                    that&apos;s why the range starts at {compact(lo)}.
                  </p>
                )}
                {src.hi && (
                  <p className="text-[11px] leading-snug text-stone-400">
                    {src.hi.band} at {compact(src.hi.guess)} means the price is within {pctLabel(src.hi.pct)} of it —
                    that&apos;s why the range tops out at {compact(hi)}.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white pl-3 pr-1.5 focus-within:border-emerald-500">
              <span className="text-lg font-black text-emerald-800">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={exact}
                onChange={(e) => onExactChange(formatPriceInput(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && !submitting && onSubmit()}
                placeholder="Enter a price"
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-lg font-black text-emerald-800 outline-none placeholder:font-normal placeholder:text-stone-300"
              />
              <button
                type="button"
                onClick={() => onApplyUnit(1_000)}
                className="rounded-md bg-stone-100 px-2.5 py-1.5 text-sm font-bold text-stone-600 transition hover:bg-emerald-50 hover:text-emerald-700"
              >
                K
              </button>
              <button
                type="button"
                onClick={() => onApplyUnit(1_000_000)}
                className="rounded-md bg-stone-100 px-2.5 py-1.5 text-sm font-bold text-stone-600 transition hover:bg-emerald-50 hover:text-emerald-700"
              >
                M
              </button>
            </div>
            <button
              type="button"
              onClick={() => onExactModeChange(false)}
              className="mx-auto mt-2 flex items-center gap-1.5 text-xs font-medium text-stone-400 transition hover:text-emerald-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M10 3.75a2 2 0 1 0-3.937.5H3a.75.75 0 0 0 0 1.5h3.063A2 2 0 0 0 10 6.25h7a.75.75 0 0 0 0-1.5h-7A2 2 0 0 0 10 3.75ZM3 9.25h7.063a2 2 0 0 1 3.874 0H17a.75.75 0 0 1 0 1.5h-3.063a2 2 0 0 1-3.874 0H3a.75.75 0 0 1 0-1.5ZM3 14.25h3.063a2 2 0 0 1 3.874 0H17a.75.75 0 0 1 0 1.5h-7.063a2 2 0 0 1-3.874 0H3a.75.75 0 0 1 0-1.5Z" />
              </svg>
              use slider
            </button>
          </>
        )}
      </div>

      <button
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? "…" : `Guess ${usd(guessValue)}`}
      </button>

      <div className="flex items-center justify-between text-xs text-stone-400">
        <span className="flex items-center gap-2">
          <span className="flex gap-1" aria-label={`${remaining} guesses left`}>
            {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
              <span key={i} className={`h-1.5 w-5 rounded-full ${i < rowCount ? "bg-emerald-500" : "bg-stone-200"}`} />
            ))}
          </span>
          <span>{remaining} left</span>
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
