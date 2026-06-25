"use client";

import { useState } from "react";
import { BANDS, WIN_THRESHOLD, type Band } from "@/lib/feedback";
import { MAX_ATTEMPTS } from "../_lib/format";

const WIN_PCT = Math.round(WIN_THRESHOLD * 100);
// Cold → nailed it, derived from the live band config so this scale can never
// drift from the real cutoffs: warm→cold bands reversed, then the win tick.
const SCALE: Band[] = [...[...BANDS].reverse().map((b) => b.band), "✅"];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 320); // let the exit animation finish before unmounting
  };
  const examples = [
    { price: "$2,000,000", hint: "Lower ↓", band: "🟥" },
    { price: "$900,000", hint: "Higher ↑", band: "🟨" },
    { price: "$1,150,000", hint: `Within ${WIN_PCT}%`, band: "✅" },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center ${
        closing ? "animate-modalfadeout" : "animate-modalfade"
      }`}
      onClick={dismiss}
    >
      <div
        className={`relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${
          closing ? "animate-modalpopout" : "animate-modalpop"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 text-xl text-stone-400 transition hover:text-stone-700"
        >
          ✕
        </button>

        <h2 className="text-2xl font-black text-emerald-900">How to play</h2>
        <p className="mt-1 text-stone-500">Guess the home&apos;s price in {MAX_ATTEMPTS} tries.</p>

        <ul className="mt-4 flex flex-col gap-2.5 text-sm text-stone-700">
          <li className="flex gap-2">
            <span>📸</span>
            <span>Study the photos, location, and stats of today&apos;s real home.</span>
          </li>
          <li className="flex gap-2">
            <span>🎚️</span>
            <span>
              Drag the slider to set a price — or just tap <b>Guess</b> to start from the middle.
            </span>
          </li>
          <li className="flex gap-2">
            <span>↕️</span>
            <span>
              Each guess tells you if the real price is <b>higher</b> or <b>lower</b>, and how close
              you are.
            </span>
          </li>
          <li className="flex gap-2">
            <span>🎯</span>
            <span>
              Land within <b>{WIN_PCT}%</b> to win. The range narrows with every guess.
            </span>
          </li>
        </ul>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-stone-400">Examples</p>
        <div className="mt-2 flex flex-col gap-2">
          {examples.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
              <span className="font-semibold text-stone-700">{r.price}</span>
              <span className="flex items-center gap-2 text-stone-500">
                {r.hint}
                <span className="animate-bandpop text-lg" style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
                  {r.band}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-xl">
          {SCALE.map((b, i) => (
            <span key={i} className="animate-bandpop" style={{ animationDelay: `${0.55 + i * 0.09}s` }}>
              {b}
            </span>
          ))}
        </div>
        <p className="mt-1 text-center text-xs text-stone-400">cold → nailed it</p>

        <button
          onClick={dismiss}
          className="mt-5 w-full rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
