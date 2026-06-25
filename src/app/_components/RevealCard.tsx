"use client";

import { useState } from "react";
import { useCountUp } from "../_hooks/useCountUp";
import { usd } from "../_lib/format";
import type { Reveal, Row } from "../_lib/types";

export function RevealCard({
  reveal,
  rows,
  shareText,
}: {
  reveal: Reveal;
  rows: Row[];
  shareText: string;
}) {
  const { result, property } = reveal;
  const [copied, setCopied] = useState(false);
  const won = result.within;
  const animatedPrice = useCountUp(property.price);

  return (
    <div className="animate-reveal mt-1 flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 text-center">
      <p className="text-xl font-bold text-emerald-900">
        {won ? `🎯 Nailed it in ${result.attemptsUsed}!` : "Out of guesses"}
      </p>
      <div className="flex items-end justify-center gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Your closest</p>
          <p className="text-lg font-semibold text-stone-600">{usd(result.bestGuess)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Actual</p>
          <p className="animate-pricepop text-2xl font-black tabular-nums text-emerald-700">
            {usd(animatedPrice)}
          </p>
        </div>
      </div>
      <p className="text-sm text-stone-600">
        {Math.round(Math.abs(result.pctError) * 100)}% off · {rows.map((r) => r.band).join("")}
      </p>

      {property.address && (
        <p className="text-xs text-stone-500">
          {property.address}, {property.city}, {property.state}
        </p>
      )}

      <button
        onClick={async () => {
          const text = `${shareText}\n${window.location.href}`;
          if (typeof navigator !== "undefined" && navigator.share) {
            try {
              await navigator.share({ text });
              return;
            } catch (e) {
              if ((e as { name?: string }).name === "AbortError") return;
            }
          }
          navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-1 self-center rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
      >
        {copied ? "Copied!" : "Share result"}
      </button>
    </div>
  );
}
