"use client";

import { LoadingHouse } from "./LoadingHouse";

/**
 * A *living* skeleton that mirrors PropertyCard's exact frame, so the page lands
 * with zero layout shift. The hero photo area hosts the house concierge, and the
 * price panel "calibrates" — a thumb sweeps the track as if the game is working
 * out today's price range before you guess.
 */
export function PropertyCardSkeleton({ quips }: { quips?: string[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-stone-100 sm:aspect-[3/2]">
        <div className="dillow-skeleton absolute inset-0 opacity-50" aria-hidden />
        <div className="relative">
          <LoadingHouse quips={quips} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-5">
        <div className="dillow-skeleton h-6 w-3/5 rounded-md" />

        <div className="flex gap-3">
          <div className="dillow-skeleton h-4 w-14 rounded" />
          <div className="dillow-skeleton h-4 w-14 rounded" />
          <div className="dillow-skeleton h-4 w-16 rounded" />
          <div className="dillow-skeleton h-4 w-14 rounded" />
        </div>

        <div className="mt-1 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
          <p className="text-center text-[11px] font-medium uppercase tracking-wide text-stone-400">
            Calibrating today&apos;s price range…
          </p>
          <div className="mt-2 flex justify-center">
            <div className="dillow-skeleton h-7 w-32 rounded-md" />
          </div>
          <div className="relative mt-4 h-1.5 w-full rounded-full bg-stone-200">
            <div
              aria-hidden
              className="animate-calibrate absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-emerald-500 shadow"
            />
          </div>
          <div className="mt-2 flex justify-between">
            <div className="dillow-skeleton h-3 w-10 rounded" />
            <div className="dillow-skeleton h-3 w-10 rounded" />
          </div>
        </div>

        <div className="h-12 w-full rounded-lg bg-emerald-600/20" aria-hidden />
      </div>
    </section>
  );
}
