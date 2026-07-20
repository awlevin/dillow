"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pencil } from "lucide-react";
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

  // Fine-scrub drag state. The native range input stays for layout, styling,
  // keyboard, and desktop mouse/pen (all unchanged 1:1); on touch we take over.
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ lastX: number; startY: number; t: number; width: number } | null>(null);
  const hintShown = useRef(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHint, setShowHint] = useState(false);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  // On touch we drive the value ourselves via the pointer handlers below. The
  // native range input, though, ALSO chases the finger on a real touch and fires
  // onChange — so the two fight and the thumb flickers (worst near the fresh
  // center, where our sensitivity-eased value barely moves off 0.5). React 19
  // registers touchstart/touchmove as *passive* at the root, so a preventDefault
  // from a synthetic onPointerDown/onTouchStart is a no-op. Attach our own
  // non-passive listeners so the native control never touches the value; our
  // scrub logic is the sole driver on touch.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (e.pointerType !== "touch") return; // mouse & pen keep the native slider
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { lastX: e.clientX, startY: e.clientY, t, width: e.currentTarget.getBoundingClientRect().width };
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
    onSliderChange(d.t);
  };

  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
  };

  const scrubChip = showHint ? "slide up for fine control" : null;

  return (
    <div className="mt-1 flex flex-col gap-2 sm:gap-3">
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
        {!exactMode ? (
          <>
            <p className="text-center text-2xl font-black tracking-tight text-emerald-800 sm:text-3xl">
              {usd(guessValue)}
            </p>
            <div className="relative mt-2 sm:mt-3">
              <input
                ref={inputRef}
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
            <div className="grid grid-cols-3 items-center text-xs text-stone-400">
              <span className="justify-self-start">{compact(lo)}</span>
              <button
                type="button"
                onClick={() => onExactModeChange(true)}
                className="flex items-center gap-1.5 justify-self-center font-medium transition hover:text-emerald-600"
              >
                <Pencil size={12} aria-hidden="true" />
                type guess
              </button>
              <span className="justify-self-end">{compact(hi)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white pl-3 pr-1.5 focus-within:border-emerald-500">
              <span className="text-lg font-black text-emerald-800">$</span>
              <input
                // Focus only when the player deliberately switched to typing —
                // a fresh home opens in this mode, and auto-popping the mobile
                // keyboard on load would be jarring.
                autoFocus={rowCount > 0}
                inputMode="decimal"
                value={exact}
                onChange={(e) => onExactChange(formatPriceInput(e.target.value))}
                onKeyDown={(e) => {
                  // Typing K or M applies the unit, same as tapping the buttons.
                  if (e.key === "k" || e.key === "K") {
                    e.preventDefault();
                    onApplyUnit(1_000);
                  } else if (e.key === "m" || e.key === "M") {
                    e.preventDefault();
                    onApplyUnit(1_000_000);
                  } else if (e.key === "Enter" && !submitting) {
                    onSubmit();
                  }
                }}
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
        {submitting ? "…" : guessValue > 0 ? `Guess ${usd(guessValue)}` : "Guess"}
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
