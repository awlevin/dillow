"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Home } from "lucide-react";
import { usd, formatPct } from "../_lib/format";
import { loadRecentHomes, type SavedHome } from "../_lib/client-storage";

// A quiet re-entry to the homes you've already played, so you can revisit the
// real listings. Mirrors RecentRoomsMenu: hidden until you've finished a home,
// collapsed by default (progressive disclosure), tap to reveal the list. Rows
// with a known listing URL open the listing in a new tab; others are inert.
export function RecentHomes() {
  const [homes, setHomes] = useState<SavedHome[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setHomes(loadRecentHomes());
    })();
  }, []);

  if (homes.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-stone-400 transition hover:text-stone-600"
      >
        <Home size={13} className="text-amber-400" aria-hidden="true" />
        Recent homes
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="animate-reveal mt-1 flex w-full max-w-xs flex-col gap-0.5">
          {homes.map((h) => {
            const inner = (
              <>
                <span className="truncate font-medium">{h.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-stone-500">{usd(h.price)}</span>
                  <span className="text-stone-400">
                    {formatPct(h.pct)}% off{h.won ? " 🎯" : ""}
                  </span>
                  <span className="font-mono text-[11px] text-stone-400">{h.date}</span>
                </span>
              </>
            );
            const cls =
              "flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm text-stone-600 transition hover:bg-amber-50";
            return (
              <li key={`${h.date}:${h.propertyId}`}>
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noopener" className={cls}>
                    {inner}
                  </a>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
