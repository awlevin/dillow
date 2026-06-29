"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useCountUp } from "../_hooks/useCountUp";
import { shareOrCopy } from "../_lib/browser-effects";
import { formatPct, usd } from "../_lib/format";
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
  const { result, property, details } = reveal;
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
        {formatPct(result.pctError)}% off ·{" "}
        <span className="tracking-[0.15em]">{rows.map((r) => r.band).join("")}</span>
      </p>

      {property.address && (
        <p className="text-xs text-stone-500">
          {property.address}, {property.city}, {property.state}
        </p>
      )}

      {details?.listingUrl && (
        <a
          href={details.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 self-center text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
        >
          View the full listing
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}

      <button
        onClick={async () => {
          if ((await shareOrCopy(shareText, window.location.href)) === "copied") {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="mt-1 self-center rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
      >
        {copied ? "Copied!" : "Share result"}
      </button>
    </div>
  );
}
