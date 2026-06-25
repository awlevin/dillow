"use client";

import { MAX_ATTEMPTS } from "../_lib/format";
import { DillowMark } from "./DillowMark";

export function GameHeader({ onHelp }: { onHelp: () => void }) {
  return (
    <header className="relative text-center">
      <h1 className="flex items-center justify-center gap-2 text-3xl font-black tracking-tight text-emerald-900 sm:text-4xl">
        <DillowMark className="h-8 w-8 sm:h-9 sm:w-9" />
        dillow
      </h1>
      <p className="mt-1 hidden text-xs text-stone-500 sm:block sm:text-sm">
        Higher or lower? Nail the price in {MAX_ATTEMPTS} tries.
      </p>
      <button
        onClick={onHelp}
        aria-label="How to play"
        className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 text-sm font-bold text-stone-500 transition hover:bg-stone-100"
      >
        ?
      </button>
    </header>
  );
}
