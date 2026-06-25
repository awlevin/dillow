"use client";

import { useEffect, useState } from "react";

const DEFAULT_QUIPS = [
  "Pulling today's listing…",
  "Turning on the lights…",
  "Checking the comps…",
  "Counting the bedrooms…",
  "Touring the rooms…",
  "Staging the photos…",
  "Reading the fine print…",
  "Talking to the neighbors…",
];

/**
 * The "house concierge" loader: the dillow house mark with its windows lighting
 * up like rooms turning on, under a rotating line of real-estate quips. Used in
 * place of flat "Loading…" text so the wait reads as part of the game.
 */
export function LoadingHouse({
  quips = DEFAULT_QUIPS,
  size = "md",
}: {
  quips?: string[];
  size?: "sm" | "md";
}) {
  // Start at 0 so the server-prerendered markup and the first client render match
  // (no hydration mismatch), then cycle through the quips.
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % quips.length), 1700);
    return () => clearInterval(id);
  }, [quips.length]);

  return (
    <div className="flex flex-col items-center gap-2.5" role="status" aria-label="Loading">
      <HouseMark className={size === "sm" ? "h-9 w-9" : "h-16 w-16"} />
      <p
        key={i}
        aria-hidden
        className={`animate-quipfade font-medium text-stone-500 ${size === "sm" ? "text-xs" : "text-sm"}`}
      >
        {quips[i]}
      </p>
    </div>
  );
}

/** The dillow house with two windows that glow in turn. Animation-only — safe to reuse anywhere. */
export function HouseMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-housebob drop-shadow-sm`}
      viewBox="0 0 100 100"
      role="img"
      aria-label="dillow"
    >
      <rect width="100" height="100" rx="24" fill="#059669" />
      {/* roof + body silhouette */}
      <path d="M50 20 L84 50 H75 V82 H25 V50 H16 Z" fill="#ffffff" />
      {/* windows light up like rooms turning on (staggered via animation-delay) */}
      <rect className="house-window" style={{ animationDelay: "0ms" }} x="33" y="56" width="13" height="13" rx="2.5" fill="#fbbf24" />
      <rect className="house-window" style={{ animationDelay: "750ms" }} x="54" y="56" width="13" height="13" rx="2.5" fill="#fbbf24" />
      {/* door */}
      <rect x="44" y="72" width="12" height="10" rx="1" fill="#059669" />
    </svg>
  );
}
