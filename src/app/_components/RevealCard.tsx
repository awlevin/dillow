"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useCountUp } from "../_hooks/useCountUp";
import { shareOrCopy } from "../_lib/browser-effects";
import { formatPct, usd } from "../_lib/format";
import type { CommunityStats, Reveal, Row } from "../_lib/types";

export function RevealCard({
  reveal,
  rows,
  shareText,
}: {
  reveal: Reveal;
  rows: Row[];
  shareText: string;
}) {
  const { result, property, details, communityStats } = reveal;
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

      {communityStats && <CommunityValuation stats={communityStats} actual={property.price} />}

      {(details?.listingUrl || details?.zillowUrl) && (
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-stone-500">
          <span>See this home on</span>
          {details.listingUrl && <ListingLink href={details.listingUrl} label="realtor.com" />}
          {details.listingUrl && details.zillowUrl && <span aria-hidden="true">·</span>}
          {details.zillowUrl && <ListingLink href={details.zillowUrl} label="Zillow" />}
        </p>
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

// Tag outbound clicks so the listing sites can attribute the traffic to Dillow.
// We also keep the referrer (rel="noopener" without "noreferrer") so they see the
// Referer header too — noopener still protects us from the opened tab.
function withUtm(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=dillow&utm_medium=referral&utm_campaign=listing`;
}

function ListingLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={withUtm(href)}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-0.5 font-medium text-emerald-700 underline-offset-2 hover:underline"
    >
      {label}
      <ExternalLink size={11} aria-hidden="true" />
    </a>
  );
}

// How the crowd's blind first guesses compare to the asking price: guessing below
// it reads as "overpriced", above it as "a steal". A ±5% dead-band counts as the
// crowd agreeing with the price.
function CommunityValuation({ stats, actual }: { stats: CommunityStats; actual: number }) {
  const pct = Math.round(Math.abs(stats.deltaPct) * 100);
  const overpriced = stats.deltaPct < -0.05;
  const underpriced = stats.deltaPct > 0.05;
  const headline = overpriced
    ? "🏷️ The crowd thinks it's overpriced"
    : underpriced
      ? "💰 The crowd thinks it's a steal"
      : "🎯 The crowd nailed the price";
  const detail =
    overpriced || underpriced
      ? `Dillow players' first guesses came in ${pct}% ${overpriced ? "below" : "above"} the ${usd(actual)} asking price.`
      : `Dillow players' first guesses landed right around the ${usd(actual)} asking price.`;

  // Marker offset from the centre (asking price), clamped so a huge miss doesn't
  // fly off the end. Left of centre = guessed lower = overpriced.
  const offset = Math.max(-1, Math.min(1, stats.deltaPct / 0.4));
  const left = 50 + offset * 50;
  const dot = overpriced ? "bg-amber-500" : underpriced ? "bg-emerald-500" : "bg-stone-400";

  return (
    <div className="rounded-lg bg-white/70 p-3">
      <p className="text-sm font-semibold text-stone-800">{headline}</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-500">{detail}</p>
      <div className="relative mt-3 h-1.5 rounded-full bg-stone-200">
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-stone-300" />
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${dot}`}
          style={{ left: `${left}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-stone-400">
        <span>Overpriced</span>
        <span>Steal</span>
      </div>
      <p className="mt-1.5 text-[11px] text-stone-400">
        based on {stats.n} {stats.n === 1 ? "guess" : "guesses"}
      </p>
    </div>
  );
}
