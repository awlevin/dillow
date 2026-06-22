"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { PropertyMap } from "./PropertyMap";
import { rdcpixLoader, rdcpixThumb, rdcpixResize } from "@/lib/rdcpix";

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
const prettyType = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

export default function Home() {
  const [date, setDate] = useState("");
  const [clue, setClue] = useState<Clue | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [lo, setLo] = useState(PRICE_MIN);
  const [hi, setHi] = useState(PRICE_MAX);
  const [t, setT] = useState(0.5); // slider position in the current [lo, hi] range
  const [exactMode, setExactMode] = useState(false);
  const [exact, setExact] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setName(localStorage.getItem("dillow:name") ?? "");
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
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem("dillow:name", trimmed);
    try {
      const res = await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: guessValue, id: getId(), name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");

      const newRow: Row = { guess: guessValue, band: data.band, direction: data.direction };
      const newRows = [...rows, newRow];
      // Narrow the range from the feedback (the over/under squeeze).
      let nLo = lo;
      let nHi = hi;
      if (!data.gameOver) {
        if (data.direction === "higher") nLo = guessValue;
        else if (data.direction === "lower") nHi = guessValue;
      }
      const newReveal: Reveal | null = data.gameOver
        ? { result: data.result, property: data.property, leaderboard: data.leaderboard }
        : null;

      setRows(newRows);
      setLo(nLo);
      setHi(nHi);
      setT(0.5);
      setExact("");
      if (newReveal) setReveal(newReveal);
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
    const head = won
      ? `Dillow ${date} — ${rows.length}/${MAX_ATTEMPTS} 🎯`
      : `Dillow ${date} — X/${MAX_ATTEMPTS}`;
    return `${head}\n${grid}\n${reveal.result.finalScore} pts · play → `;
  }, [reveal, rows, date]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:gap-5 sm:py-10">
      <header className="text-center">
        <h1 className="text-3xl font-black tracking-tight text-emerald-900 sm:text-4xl">dillow</h1>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">
          Higher or lower? Nail the price in {MAX_ATTEMPTS} tries.
        </p>
      </header>

      {loading && <p className="text-center text-stone-400">Loading today&apos;s home…</p>}
      {error && !clue && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
      )}

      {clue && (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="relative aspect-[3/2] bg-stone-100">
            <Image
              key={clue.photos[photoIdx]}
              src={clue.photos[photoIdx]}
              alt="Property"
              fill
              sizes="(max-width: 640px) 100vw, 576px"
              loader={rdcpixLoader}
              placeholder="blur"
              blurDataURL={rdcpixThumb(clue.photos[photoIdx])}
              className="object-cover"
            />
            {clue.photos.length > 1 && (
              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {clue.photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={`h-2 w-2 rounded-full ${i === photoIdx ? "bg-white" : "bg-white/50"}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <p className="text-lg font-semibold text-stone-800">
              {clue.city}, {clue.state}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
              {clue.beds != null && <Stat label="Beds" value={clue.beds} />}
              {clue.baths != null && <Stat label="Baths" value={clue.baths} />}
              {clue.sqft != null && <Stat label="Sq Ft" value={clue.sqft.toLocaleString()} />}
              {clue.propertyType && <Stat label="Type" value={prettyType(clue.propertyType)} />}
            </div>

            {/* Optional location peek — collapsed by default to avoid overload. */}
            {!done && clue.lat != null && clue.lon != null && (
              <div className="-mt-1">
                <button
                  onClick={() => setShowMap((v) => !v)}
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  📍 {showMap ? "Hide" : "Location"}
                </button>
                {showMap && (
                  <div className="mt-2">
                    <PropertyMap lat={clue.lat} lon={clue.lon} />
                    <p className="mt-1 text-center text-xs text-stone-400">
                      Location is a clue — but the exact price is still up to you.
                    </p>
                  </div>
                )}
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
                        ? "Within 5% 🎯"
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
                {rows.length === 0 &&
                  (name.trim() && !editingName ? (
                    <p className="text-center text-sm text-stone-500">
                      Playing as <span className="font-semibold text-stone-700">{name.trim()}</span>{" "}
                      ·{" "}
                      <button
                        onClick={() => setEditingName(true)}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        change
                      </button>
                    </p>
                  ) : (
                    <input
                      value={name}
                      autoFocus={editingName}
                      onChange={(e) => {
                        setName(e.target.value);
                        localStorage.setItem("dillow:name", e.target.value.trim());
                      }}
                      onBlur={() => name.trim() && setEditingName(false)}
                      onKeyDown={(e) => e.key === "Enter" && name.trim() && setEditingName(false)}
                      placeholder="Your name (to join the leaderboard)"
                      maxLength={24}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-center text-sm outline-none focus:border-emerald-500"
                    />
                  ))}

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
              <RevealCard reveal={reveal!} rows={rows} shareText={shareText} />
            )}
          </div>
        </section>
      )}

      <Yesterday />

      <footer className="text-center text-xs text-stone-400">
        Real listings from across the US via realtor.com.
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

function RevealCard({ reveal, rows, shareText }: { reveal: Reveal; rows: Row[]; shareText: string }) {
  const { result, property, leaderboard } = reveal;
  const [copied, setCopied] = useState(false);
  const won = result.within;

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
        {Math.round(Math.abs(result.pctError) * 100)}% off ·{" "}
        <span className="font-semibold">{result.finalScore} pts</span> ·{" "}
        {rows.map((r) => r.band).join("")}
      </p>

      {property.address && (
        <p className="text-xs text-stone-500">
          {property.address}, {property.city}, {property.state}
        </p>
      )}

      {leaderboard?.enabled && leaderboard.rank != null && (
        <p className="rounded-lg bg-white/70 px-3 py-2 text-sm text-emerald-800">
          🏆 You&apos;re <span className="font-bold">#{leaderboard.rank}</span> of {leaderboard.count}{" "}
          today · full results drop tomorrow
        </p>
      )}

      <button
        onClick={() => {
          navigator.clipboard?.writeText(shareText + window.location.href);
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

function Yesterday() {
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
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
        Yesterday&apos;s results{date ? ` · ${date}` : ""}
      </h2>
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
                {Math.round(Math.abs(e.pctError) * 100)}% off · {e.attempts}/{MAX_ATTEMPTS} ·{" "}
                <span className="font-semibold text-stone-700">{e.score}</span>
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
