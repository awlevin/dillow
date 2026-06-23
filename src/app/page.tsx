"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PropertyMap } from "./PropertyMap";
import { rdcpixLoader, rdcpixThumb, rdcpixResize } from "@/lib/rdcpix";
import { narrowBounds } from "@/lib/game";

const MAX_ATTEMPTS = 5;
const PRICE_MIN = 50_000;
const PRICE_MAX = 25_000_000;

type Clue = {
  id: string;
  city: string;
  state: string;
  lat: number | null;
  lon: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  photos: string[];
};

type Row = { guess: number; band: string; direction: "higher" | "lower" | "match" };

type FullProperty = Clue & {
  price: number;
  address?: string;
  lat: number | null;
  lon: number | null;
};

type Reveal = {
  result: {
    bestGuess: number;
    bestScore: number;
    finalScore: number;
    pctError: number;
    within: boolean;
    attemptsUsed: number;
  };
  property: FullProperty;
  leaderboard?: { enabled: boolean; rank?: number | null; count?: number };
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : `$${Math.round(n / 1000)}K`;
const TYPE_NAMES: Record<string, string> = {
  single_family: "House",
  multi_family: "Multi-family home",
  condos: "Condo",
  condo: "Condo",
  condo_townhome: "Condo",
  condo_townhome_rowhome_coop: "Condo",
  townhomes: "Townhome",
  townhouse: "Townhome",
  apartment: "Apartment",
  apartments: "Apartment",
  coop: "Co-op",
  duplex_triplex: "Duplex",
  land: "Lot",
  farm: "Farm",
  mobile: "Mobile home",
};
// A clean singular noun for the listing type ("Condo", "House", …).
const typeName = (t: string | null): string | null =>
  !t
    ? null
    : (TYPE_NAMES[t] ??
      t
        .replace(/_/g, " ")
        .replace(/s$/, "")
        .replace(/\b\w/g, (c) => c.toUpperCase()));

// "Condo in Austin, TX" — falls back to just the location if type is unknown.
const propertyTitle = (c: { propertyType: string | null; city: string; state: string }) => {
  const n = typeName(c.propertyType);
  return n ? `${n} in ${c.city}, ${c.state}` : `${c.city}, ${c.state}`;
};

// Round to 3 significant figures so slider values read as "nice" prices.
function niceRound(p: number): number {
  if (p <= 0) return p;
  const mag = Math.pow(10, Math.floor(Math.log10(p)) - 2);
  return Math.round(p / mag) * mag;
}
// Log-scale position (0..1) → price, so each slider step is proportional.
function tToPrice(t: number, lo: number, hi: number): number {
  return niceRound(Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * t));
}

function getId(): string {
  let id = localStorage.getItem("dillow:id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("dillow:id", id);
  }
  return id;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Streak = consecutive days finished. Active only if the last play was today or
// yesterday; otherwise it has lapsed and reads as 0.
function loadStreak(): number {
  try {
    const raw = localStorage.getItem("dillow:streak");
    if (!raw) return 0;
    const { count, lastDate } = JSON.parse(raw);
    const today = isoDay(new Date());
    const yest = isoDay(new Date(Date.now() - 86_400_000));
    return lastDate === today || lastDate === yest ? count : 0;
  } catch {
    return 0;
  }
}

function recordPlay(): number {
  const today = isoDay(new Date());
  const yest = isoDay(new Date(Date.now() - 86_400_000));
  let count = 1;
  let best = 1;
  try {
    const raw = localStorage.getItem("dillow:streak");
    if (raw) {
      const s = JSON.parse(raw);
      best = s.best ?? s.count ?? 0;
      if (s.lastDate === today) return s.count; // already counted today
      if (s.lastDate === yest) count = s.count + 1;
    }
  } catch {
    /* start fresh */
  }
  best = Math.max(best, count);
  localStorage.setItem("dillow:streak", JSON.stringify({ count, lastDate: today, best }));
  return count;
}

// Per-game history for long-term stats (accuracy by price band, win rate, etc.).
type StatEntry = {
  date: string;
  price: number;
  pct: number; // abs % error of best guess
  attempts: number;
  won: boolean;
  state: string;
};

function recordStats(e: StatEntry) {
  try {
    const raw = localStorage.getItem("dillow:stats");
    const arr: StatEntry[] = raw ? JSON.parse(raw) : [];
    if (arr.some((x) => x.date === e.date)) return; // one record per day
    arr.push(e);
    localStorage.setItem("dillow:stats", JSON.stringify(arr.slice(-400)));
  } catch {
    /* ignore */
  }
}

export default function Home() {
  const [date, setDate] = useState("");
  const [clue, setClue] = useState<Clue | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [lo, setLo] = useState(PRICE_MIN);
  const [hi, setHi] = useState(PRICE_MAX);
  const [t, setT] = useState(0.5); // slider position in the current [lo, hi] range
  const [exactMode, setExactMode] = useState(false);
  const [exact, setExact] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [streak, setStreak] = useState(0);
  const [statsVersion, setStatsVersion] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!localStorage.getItem("dillow:seenTutorial")) setShowHelp(true); // first visit
        setStreak(loadStreak());
        const res = await fetch("/api/daily");
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        setDate(data.date);
        setClue(data.property);
        const saved = localStorage.getItem(`dillow:game:${data.date}`);
        if (saved) {
          const g = JSON.parse(saved);
          setRows(g.rows ?? []);
          setLo(g.lo ?? PRICE_MIN);
          setHi(g.hi ?? PRICE_MAX);
          setReveal(g.reveal ?? null);
        }
      } catch {
        setError("Couldn't load today's home.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const done = reveal !== null;
  const remaining = MAX_ATTEMPTS - rows.length;
  const pivot = useMemo(() => tToPrice(t, lo, hi), [t, lo, hi]);
  const guessValue = exactMode
    ? Math.min(hi, Math.max(lo, Number(exact.replace(/[^0-9]/g, "")) || 0))
    : pivot;

  async function submit() {
    if (!Number.isFinite(guessValue) || guessValue <= 0) {
      setError("Pick a price first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: guessValue, id: getId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");

      const newRow: Row = { guess: guessValue, band: data.band, direction: data.direction };
      const newRows = [...rows, newRow];
      // Narrow the range from the feedback: the direction sets the near bound to
      // the guess, and the warmth band sets the far bound (it caps how far off
      // the guess can be). See narrowBounds in lib/game.
      let nLo = lo;
      let nHi = hi;
      if (!data.gameOver) {
        ({ lo: nLo, hi: nHi } = narrowBounds(lo, hi, guessValue, data.direction, data.band));
      }
      const newReveal: Reveal | null = data.gameOver
        ? { result: data.result, property: data.property, leaderboard: data.leaderboard }
        : null;

      setRows(newRows);
      setLo(nLo);
      setHi(nHi);
      setT(0.5);
      setExact("");
      if (newReveal) {
        setReveal(newReveal);
        setStreak(recordPlay());
        recordStats({
          date,
          price: data.property.price,
          pct: Math.abs(data.result.pctError),
          attempts: data.result.attemptsUsed,
          won: data.result.within,
          state: data.property.state,
        });
        setStatsVersion((v) => v + 1);
      }
      localStorage.setItem(
        `dillow:game:${date}`,
        JSON.stringify({ rows: newRows, lo: nLo, hi: nHi, reveal: newReveal }),
      );
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const shareText = useMemo(() => {
    if (!reveal) return "";
    const grid = rows.map((r) => r.band).join("");
    const won = reveal.result.within;
    const pct = Math.round(Math.abs(reveal.result.pctError) * 100);
    const tries = won ? `${rows.length}/${MAX_ATTEMPTS} 🎯` : `X/${MAX_ATTEMPTS}`;
    return `Dillow ${date} — ${tries} · ${pct}% off\n${grid}`;
  }, [reveal, rows, date]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:gap-5 sm:py-10">
      {showHelp && (
        <HowToPlay
          onClose={() => {
            setShowHelp(false);
            localStorage.setItem("dillow:seenTutorial", "1");
          }}
        />
      )}

      <header className="relative text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-black tracking-tight text-emerald-900 sm:text-4xl">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-lg text-white sm:h-9 sm:w-9">
            ?
          </span>
          dillow
        </h1>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">
          Higher or lower? Nail the price in {MAX_ATTEMPTS} tries.
        </p>
        <button
          onClick={() => setShowHelp(true)}
          aria-label="How to play"
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 text-sm font-bold text-stone-500 transition hover:bg-stone-100"
        >
          ?
        </button>
      </header>

      {loading && <p className="text-center text-stone-400">Loading today&apos;s home…</p>}
      {error && !clue && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
      )}

      {clue && (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="relative bg-stone-100">
            <div
              ref={carouselRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const i = Math.round(el.scrollLeft / el.clientWidth);
                if (i !== photoIdx) setPhotoIdx(i);
              }}
              className="no-scrollbar flex aspect-[3/2] snap-x snap-mandatory overflow-x-auto"
            >
              {clue.photos.map((src, i) => (
                <div key={src} className="relative h-full w-full shrink-0 snap-center">
                  <Image
                    src={src}
                    alt={`Photo ${i + 1}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 576px"
                    loader={rdcpixLoader}
                    placeholder="blur"
                    blurDataURL={rdcpixThumb(src)}
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            {clue.photos.length > 1 && (
              <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {clue.photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      carouselRef.current?.scrollTo({
                        left: i * carouselRef.current.clientWidth,
                        behavior: "smooth",
                      })
                    }
                    aria-label={`Photo ${i + 1}`}
                    className={`pointer-events-auto h-2 w-2 rounded-full transition ${
                      i === photoIdx ? "bg-white" : "bg-white/50"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <p className="text-lg font-semibold text-stone-800">{propertyTitle(clue)}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
              {clue.beds != null && <Stat label="Beds" value={clue.beds} />}
              {clue.baths != null && <Stat label="Baths" value={clue.baths} />}
              {clue.sqft != null && <Stat label="Sq Ft" value={clue.sqft.toLocaleString()} />}
              {clue.yearBuilt != null && <Stat label="Built" value={clue.yearBuilt} />}
              {!done && clue.lat != null && clue.lon != null && (
                <button
                  onClick={() => setShowMap((v) => !v)}
                  className="ml-auto font-medium text-emerald-700 hover:underline"
                >
                  📍 {showMap ? "Hide" : "Map"}
                </button>
              )}
            </div>

            {/* Optional location peek — collapsed by default to avoid overload. */}
            {!done && showMap && clue.lat != null && clue.lon != null && (
              <div className="-mt-1">
                <PropertyMap lat={clue.lat} lon={clue.lon} />
                <p className="mt-1 text-center text-xs text-stone-400">
                  Location is a clue — but the exact price is still up to you.
                </p>
              </div>
            )}

            {rows.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className="animate-rowin flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-stone-700">{usd(r.guess)}</span>
                    <span className="flex items-center gap-2 text-stone-500">
                      {r.direction === "match"
                        ? "Nailed it"
                        : r.direction === "higher"
                          ? "Higher ↑"
                          : "Lower ↓"}
                      <span className="text-base">{r.band}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!done ? (
              <div className="mt-1 flex flex-col gap-3">
                {/* Over/under slider */}
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-center text-[11px] font-medium uppercase tracking-wide text-stone-400">
                    {rows.length === 0 ? "Drag, or tap Guess to start in the middle" : "Higher or lower?"}
                  </p>
                  <p className="text-center text-3xl font-black tracking-tight text-emerald-800">
                    {usd(guessValue)}
                  </p>
                  {!exactMode ? (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={1000}
                        value={Math.round(t * 1000)}
                        onChange={(e) => setT(Number(e.target.value) / 1000)}
                        className="mt-3 h-2 w-full cursor-pointer touch-none accent-emerald-600"
                        aria-label="Price guess"
                      />
                      <div className="flex justify-between text-xs text-stone-400">
                        <span>{compact(lo)}</span>
                        <span>{compact(hi)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 flex items-center rounded-lg border border-stone-300 bg-white px-3">
                      <span className="text-stone-400">$</span>
                      <input
                        autoFocus
                        inputMode="numeric"
                        value={exact}
                        onChange={(e) =>
                          setExact(
                            e.target.value.replace(/[^0-9]/g, "")
                              ? Number(e.target.value.replace(/[^0-9]/g, "")).toLocaleString()
                              : "",
                          )
                        }
                        onKeyDown={(e) => e.key === "Enter" && !submitting && submit()}
                        placeholder={`${compact(lo)} – ${compact(hi)}`}
                        className="w-full bg-transparent px-2 py-2 outline-none"
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={submit}
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? "…" : `Guess ${usd(guessValue)}`}
                </button>

                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span className="flex items-center gap-2">
                    <span className="flex gap-1" aria-label={`${remaining} guesses left`}>
                      {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-5 rounded-full ${
                            i < rows.length ? "bg-emerald-500" : "bg-stone-200"
                          }`}
                        />
                      ))}
                    </span>
                    <span>{remaining} left</span>
                  </span>
                  <button
                    onClick={() => setExactMode((v) => !v)}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {exactMode ? "use slider" : "type exact"}
                  </button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            ) : (
              <RevealCard reveal={reveal!} rows={rows} shareText={shareText} date={date} />
            )}
          </div>
        </section>
      )}

      <Yesterday streak={streak} />

      <StatsPanel version={statsVersion} />

      <footer className="text-center">
        <p className="text-xs text-stone-400">Real listings from across the US via realtor.com.</p>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="font-semibold text-stone-800">{value}</span>{" "}
      <span className="text-stone-400">{label}</span>
    </span>
  );
}

function HowToPlay({ onClose }: { onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 320); // let the exit animation finish before unmounting
  };
  const examples = [
    { price: "$2,000,000", hint: "Lower ↓", band: "🟥" },
    { price: "$900,000", hint: "Higher ↑", band: "🟨" },
    { price: "$1,150,000", hint: "Within 5%", band: "✅" },
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
              Land within <b>5%</b> to win. The range narrows with every guess.
            </span>
          </li>
        </ul>

        <p className="mt-5 text-xs font-bold uppercase tracking-wide text-stone-400">Examples</p>
        <div className="mt-2 flex flex-col gap-2">
          {examples.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-stone-700">{r.price}</span>
              <span className="flex items-center gap-2 text-stone-500">
                {r.hint}
                <span
                  className="animate-bandpop text-lg"
                  style={{ animationDelay: `${0.3 + i * 0.2}s` }}
                >
                  {r.band}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-xl">
          {["🟥", "🟧", "🟨", "🟩", "✅"].map((b, i) => (
            <span
              key={i}
              className="animate-bandpop"
              style={{ animationDelay: `${0.55 + i * 0.09}s` }}
            >
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

function StatsPanel({ version }: { version: number }) {
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
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Accuracy by price
          </p>
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

function RevealCard({
  reveal,
  rows,
  shareText,
  date,
}: {
  reveal: Reveal;
  rows: Row[];
  shareText: string;
  date: string;
}) {
  const { result, property, leaderboard } = reveal;
  const [copied, setCopied] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joinRank, setJoinRank] = useState<{ rank: number; count: number } | null>(
    leaderboard?.rank != null ? { rank: leaderboard.rank, count: leaderboard.count ?? 0 } : null,
  );
  const [joining, setJoining] = useState(false);
  const won = result.within;

  const join = async (nameArg?: string) => {
    const name = (nameArg ?? joinName).trim();
    if (!name || joining) return;
    setJoining(true);
    localStorage.setItem("dillow:name", name);
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: getId(), name }),
      });
      const data = await res.json();
      if (res.ok && typeof data.rank === "number") {
        setJoinRank({ rank: data.rank, count: data.count });
        try {
          const raw = localStorage.getItem(`dillow:game:${date}`);
          if (raw) {
            const g = JSON.parse(raw);
            if (g.reveal) {
              g.reveal.leaderboard = { enabled: true, rank: data.rank, count: data.count };
              localStorage.setItem(`dillow:game:${date}`, JSON.stringify(g));
            }
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    (async () => {
      const saved = localStorage.getItem("dillow:name") ?? "";
      setJoinName(saved);
      if (saved && !joinRank && leaderboard?.enabled) await join(saved); // returning → auto-join
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="text-2xl font-black text-emerald-700">{usd(property.price)}</p>
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

      {leaderboard?.enabled &&
        (joinRank ? (
          <p className="rounded-lg bg-white/70 px-3 py-2 text-sm text-emerald-800">
            🏆 You&apos;re <span className="font-bold">#{joinRank.rank}</span> of {joinRank.count}{" "}
            today · full results drop tomorrow
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-white/70 p-3 text-left">
            <p className="text-sm font-medium text-stone-700">
              Add your name to today&apos;s leaderboard
            </p>
            <div className="flex gap-2">
              <input
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="Your name"
                maxLength={24}
                className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => join()}
                disabled={joining}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {joining ? "…" : "Join"}
              </button>
            </div>
          </div>
        ))}

      <button
        onClick={async () => {
          const text = `${shareText}\n${window.location.href}`;
          if (typeof navigator !== "undefined" && navigator.share) {
            try {
              await navigator.share({ text });
              return;
            } catch (e) {
              if ((e as { name?: string }).name === "AbortError") return; // user cancelled
              // otherwise fall through to clipboard (e.g. desktop with no share target)
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
      <p className="text-xs text-stone-400">Come back tomorrow for a new home.</p>
    </div>
  );
}

type Entry = {
  id: string;
  name: string;
  guess: number;
  score: number;
  pctError: number;
  attempts: number;
};
type Board = {
  enabled: boolean;
  revealed?: boolean;
  date?: string;
  property?: { city: string; state: string; price: number; photos: string[] };
  top?: Entry[];
  count?: number;
};

function Yesterday({ streak }: { streak: number }) {
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => setBoard({ enabled: false }));
  }, []);

  if (!board?.enabled || !board.revealed) return null;
  const { property, top = [], count = 0, date } = board;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          Yesterday&apos;s results{date ? ` · ${date}` : ""}
        </h2>
        {streak > 0 && (
          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-sm font-bold text-orange-600">
            🔥 {streak}-day streak
          </span>
        )}
      </div>
      {property && (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rdcpixResize(property.photos[0], 160)}
            alt=""
            className="h-14 w-20 rounded-lg object-cover"
          />
          <div>
            <p className="text-sm text-stone-600">
              {property.city}, {property.state}
            </p>
            <p className="text-lg font-black text-emerald-700">{usd(property.price)}</p>
          </div>
        </div>
      )}
      {top.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-1.5">
          {top.map((e, i) => (
            <li key={e.id} className="flex items-center justify-between text-sm">
              <span className="text-stone-700">
                <span className="inline-block w-6 font-bold text-stone-400">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                {e.name}
              </span>
              <span className="text-stone-500">
                {Math.round(Math.abs(e.pctError) * 100)}% off · {e.attempts}/{MAX_ATTEMPTS}
              </span>
            </li>
          ))}
          <li className="mt-1 text-xs text-stone-400">{count} players guessed yesterday</li>
        </ol>
      ) : (
        <p className="mt-3 text-sm text-stone-400">
          No entries yesterday — play today and you&apos;ll appear here tomorrow.
        </p>
      )}
    </section>
  );
}
