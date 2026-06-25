"use client";

export function DillowMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label="Dillow">
      <rect width="100" height="100" rx="24" fill="#059669" />
      <path d="M50 22 L82 50 H74 V80 H26 V50 H18 Z" fill="#ffffff" />
      <text
        x="50"
        y="74"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="38"
        fontWeight="bold"
        fill="#059669"
      >
        $
      </text>
    </svg>
  );
}
