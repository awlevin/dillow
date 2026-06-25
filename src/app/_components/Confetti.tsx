"use client";

import type React from "react";

// Deterministic 0..1 hash so confetti scatters look random but stay pure
// (React 19's compiler forbids Math.random during render).
const scatter = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// Hand-rolled emoji confetti — a celebratory shower for a win, no deps.
export function Confetti() {
  const emojis = ["🎉", "🎊", "💰", "🏡", "✨", "🔑", "💵", "🥳"];
  const pieces = Array.from({ length: 38 }, (_, i) => ({
    id: i,
    left: scatter(i + 1) * 100,
    delay: scatter(i + 2) * 0.5,
    duration: 2.4 + scatter(i + 3) * 1.8,
    drift: (scatter(i + 4) - 0.5) * 90,
    rot: scatter(i + 5) * 720 - 360,
    emoji: emojis[i % emojis.length],
    size: 18 + Math.round(scatter(i + 6) * 12),
  }));

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti absolute top-0 leading-none"
          style={
            {
              left: `${p.left}%`,
              fontSize: `${p.size}px`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
