"use client";

import { useEffect, useState } from "react";
import type { StatEntry } from "../_lib/types";

const PRICE_BANDS = [
  { label: "Under $500k", min: 0, max: 500_000 },
  { label: "$500k–$1.5M", min: 500_000, max: 1_500_000 },
  { label: "$1.5M–$5M", min: 1_500_000, max: 5_000_000 },
  { label: "Over $5M", min: 5_000_000, max: Infinity },
];

// A city breakdown can get long; cap it so the panel doesn't sprawl.
const CITY_CAP = 6;

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

type Group = { label: string; count: number; avg: number };

export function StatsPanel({ version }: { version: number }) {
  const [stats, setStats] = useState<StatEntry[]>([]);
  const [best, setBest] = useState(0);
  const [view, setView] = useState<"price" | "city">("price");

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

  const priceGroups: Group[] = PRICE_BANDS.map((b) => {
    const inBand = stats.filter((s) => s.price >= b.min && s.price < b.max);
    return { label: b.label, count: inBand.length, avg: median(inBand.map((s) => s.pct)) };
  }).filter((b) => b.count > 0);

  // City breakdown, best-accuracy first. Only entries that recorded a city count
  // (older saved plays didn't), so this fills in as new homes are played.
  const byCity = new Map<string, number[]>();
  for (const s of stats) {
    if (!s.city) continue;
    const key = `${s.city}, ${s.state}`;
    (byCity.get(key) ?? byCity.set(key, []).get(key)!).push(s.pct);
  }
  const cityGroups: Group[] = [...byCity]
    .map(([label, pcts]) => ({ label, count: pcts.length, avg: median(pcts) }))
    .sort((a, b) => a.avg - b.avg || b.count - a.count);
  const hasCity = cityGroups.length > 0;
  const shownCities = cityGroups.slice(0, CITY_CAP);
  const moreCities = cityGroups.length - shownCities.length;

  const groups = view === "city" ? shownCities : priceGroups;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Your stats</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Played" value={String(played)} />
        <Metric label="Bullseye rate" value={`${Math.round((wins / played) * 100)}%`} />
        <Metric label="Median miss" value={`${Math.round(medMiss * 100)}%`} />
        <Metric label="Best streak" value={String(best)} />
      </div>

      {(priceGroups.length > 0 || hasCity) && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Accuracy</p>
            {/* Only a toggle once there's city data — otherwise it's just the price view. */}
            {hasCity && (
              <div className="flex rounded-full bg-stone-100 p-0.5 text-xs font-semibold">
                {(["price", "city"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-full px-2.5 py-0.5 capitalize transition ${
                      view === v ? "bg-white text-emerald-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="mt-2 flex flex-col gap-1.5">
            {groups.map((g) => (
              <li key={g.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-stone-600">{g.label}</span>
                <span className="shrink-0 text-stone-400">
                  <span className={`font-semibold ${missColor(g.avg)}`}>{Math.round(g.avg * 100)}% off</span> ·{" "}
                  {g.count} {g.count === 1 ? "home" : "homes"}
                </span>
              </li>
            ))}
          </ul>

          {view === "city" && moreCities > 0 && (
            <p className="mt-1.5 text-[11px] text-stone-400">
              +{moreCities} more {moreCities === 1 ? "city" : "cities"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
