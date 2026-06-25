"use client";

import { Pencil } from "lucide-react";
import { compact, formatPriceInput, MAX_ATTEMPTS, usd } from "../_lib/format";

type GuessControlsProps = {
  rowCount: number;
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

export function GuessControls({
  rowCount,
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
                className="absolute right-0 rounded-md p-1 text-stone-300 transition hover:bg-stone-200/60 hover:text-emerald-600"
              >
                <Pencil size={18} aria-hidden="true" />
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(t * 1000)}
              onChange={(e) => onSliderChange(Number(e.target.value) / 1000)}
              className="mt-2 h-2 w-full cursor-pointer touch-none accent-emerald-600 sm:mt-3"
              aria-label="Price guess"
            />
            <div className="flex justify-between text-xs text-stone-400">
              <span>{compact(lo)}</span>
              <span>{compact(hi)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white pl-3 pr-1.5 focus-within:border-emerald-500">
              <span className="text-lg font-black text-emerald-800">$</span>
              <input
                autoFocus
                inputMode="numeric"
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
