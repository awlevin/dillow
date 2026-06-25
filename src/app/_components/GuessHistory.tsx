"use client";

import { usd } from "../_lib/format";
import type { Row } from "../_lib/types";

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
          </span>
        </li>
      ))}
    </ul>
  );
}
