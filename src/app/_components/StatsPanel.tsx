"use client";

import { useEffect, useState } from "react";
import type { StatEntry } from "../_lib/types";

const PRICE_BANDS = [
  { label: "Under $500k", min: 0, max: 500_000 },
  { label: "$500k–$1.5M", min: 500_000, max: 1_500_000 },
  { label: "$1.5M–$5M", min: 1_500_000, max: 5_000_000 },
  { label: "Over $5M", min: 5_000_000, max: Infinity },
];

const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const missColor = (p: number) =>
  p < 0.1 ? "text-emerald-600" : p < 0.2 ? "text-amber-600" : "text-red-500";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-2 text-center">
      <p className="text-xl font-black text-emerald-700">{value}</p>
      <p className="text-xs text-stone-400">{label}</p>
    </div>
  );
}

export function StatsPanel({ version }: { version: number }) {
  const [stats, setStats] = useState<StatEntry[]>([]);
  const [best, setBest] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem("dillow:stats");
        setStats(raw ? JSON.parse(raw) : []);
        const s = localStorage.getItem("dillow:streak");
        setBest(s ? (JSON.parse(s).best ?? 0) : 0);
      } catch {
        setStats([]);
      }
    })();
  }, [version]);

  if (stats.length === 0) return null;

  const played = stats.length;
  const wins = stats.filter((s) => s.won).length;
  const medMiss = median(stats.map((s) => s.pct));

  const bands = PRICE_BANDS.map((b) => {
    const inBand = stats.filter((s) => s.price >= b.min && s.price < b.max);
    return { label: b.label, count: inBand.length, avg: median(inBand.map((s) => s.pct)) };
  }).filter((b) => b.count > 0);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Your stats</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Played" value={String(played)} />
        <Metric label="Bullseye rate" value={`${Math.round((wins / played) * 100)}%`} />
        <Metric label="Median miss" value={`${Math.round(medMiss * 100)}%`} />
        <Metric label="Best streak" value={String(best)} />
      </div>
      {bands.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Accuracy by price</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {bands.map((b) => (
              <li key={b.label} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{b.label}</span>
                <span className="text-stone-400">
                  <span className={`font-semibold ${missColor(b.avg)}`}>
                    {Math.round(b.avg * 100)}% off
                  </span>{" "}
                  · {b.count} {b.count === 1 ? "home" : "homes"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
