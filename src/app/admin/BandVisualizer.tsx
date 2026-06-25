"use client";

import { useState } from "react";
import { BAND_LADDER, bandWindows, WIN_THRESHOLD, type Band } from "@/lib/feedback";

// Swatch colors per band, mirroring the emoji. Way-off (❌) reads as neutral
// stone — being told you're way off says nothing about how far off you are.
const SWATCH: Record<Band, string> = {
  "✅": "bg-emerald-500",
  "🟩": "bg-green-500",
  "🟨": "bg-yellow-400",
  "🟧": "bg-orange-500",
  "🟥": "bg-red-500",
  "❌": "bg-stone-400",
};

const usd = (n: number) => {
  if (!isFinite(n)) return "∞";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
};

const pct = (p: number) => (isFinite(p) ? `${+(p * 100).toFixed(2)}%` : "∞");

// A guess window rendered as a $ range, collapsing an open top to "> $lo".
function range(w: { lo: number; hi: number }) {
  return isFinite(w.hi) ? `${usd(w.lo)} – ${usd(w.hi)}` : `> ${usd(w.lo)}`;
}

function BandRowView({
  band,
  label,
  window: w,
}: {
  band: Band;
  label: string;
  window: { lo: number; hi: number } | null;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`h-3 w-3 shrink-0 rounded-sm ${SWATCH[band]}`} />
      <span className="w-7 shrink-0 text-center text-lg leading-none">{band}</span>
      <span className="w-24 shrink-0 text-xs text-stone-400">{label}</span>
      <span className="font-mono text-sm text-stone-700">
        {w ? range(w) : <span className="text-stone-300">unreachable</span>}
      </span>
    </div>
  );
}

export function BandVisualizer() {
  const [raw, setRaw] = useState("1,200,000");
  const price = Number(raw.replace(/[^0-9.]/g, ""));
  const valid = isFinite(price) && price > 0;

  // Center → cold. Above-target rows go coldest-first (top of the column),
  // below-target rows go closest-first; the win band straddles the target.
  const cold = [...BAND_LADDER].slice(1).reverse(); // [❌, 🟥, 🟧, 🟨, 🟩]
  const warm = BAND_LADDER.slice(1); //              [🟩, 🟨, 🟧, 🟥, ❌]
  const win = BAND_LADDER[0];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs uppercase tracking-wide text-stone-400">Band cutoffs</p>
        <p className="mt-1 text-xs text-stone-500">
          Enter a target price to see which dollar guesses fall in each color, derived live from{" "}
          <code className="rounded bg-stone-100 px-1">feedback.ts</code>. Win is within{" "}
          {pct(WIN_THRESHOLD)}.
        </p>
      </div>

      <label className="text-sm font-medium text-stone-700">Target price</label>
      <input
        inputMode="decimal"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="1,200,000"
        className="rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-500"
      />

      {valid ? (
        <div className="flex flex-col">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-400">
            Above target (over-guess)
          </p>
          {cold.map((row) => (
            <BandRowView
              key={`a-${row.band}`}
              band={row.band}
              label={`${pct(row.loPct)} – ${pct(row.hiPct)}`}
              window={bandWindows(price, row).above}
            />
          ))}

          <div className="my-2 flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2">
            <span className={`h-3 w-3 shrink-0 rounded-sm ${SWATCH[win.band]}`} />
            <span className="w-7 shrink-0 text-center text-lg leading-none">{win.band}</span>
            <span className="w-24 shrink-0 text-xs text-emerald-700">
              ±{pct(win.hiPct)} · target
            </span>
            <span className="font-mono text-sm font-semibold text-emerald-800">
              {usd(price * (1 - win.hiPct))} – {usd(price * (1 + win.hiPct))}
            </span>
          </div>

          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-400">
            Below target (under-guess)
          </p>
          {warm.map((row) => (
            <BandRowView
              key={`b-${row.band}`}
              band={row.band}
              label={`${pct(row.loPct)} – ${pct(row.hiPct)}`}
              window={bandWindows(price, row).below}
            />
          ))}

          <p className="mt-3 text-xs text-stone-400">
            Under-guesses bottom out at a $0 guess (100% off), so the coldest bands are{" "}
            <span className="text-stone-500">unreachable</span> below the target — the warmth scale
            is lopsided between over- and under-guessing.
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone-400">Enter a positive price to see the cutoffs.</p>
      )}
    </div>
  );
}
