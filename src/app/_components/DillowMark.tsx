"use client";

import { MARK } from "../_lib/mark";

export function DillowMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label="Dillow">
      <rect width="100" height="100" rx="24" fill="#059669" />
      <path d={MARK.house} fill="#ffffff" />
      <path
        d={MARK.dollarS}
        fill="none"
        stroke="#059669"
        strokeWidth={MARK.dollarStroke}
        strokeLinecap="round"
      />
      <path
        d={MARK.dollarBar}
        fill="none"
        stroke="#059669"
        strokeWidth={MARK.dollarStroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
