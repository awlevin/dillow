"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { narrowBounds, type Band } from "@/lib/feedback";
import { buzz, smoothScrollTo } from "../_lib/browser-effects";
import { getId, recordRecentHome, recordStats } from "../_lib/client-storage";
import { exactGuess, MAX_ATTEMPTS, PRICE_MAX, PRICE_MIN, priceToT, propertyTitle, tToPrice } from "../_lib/format";
import {
  loadLocalProgress,
  loadLocalSpot,
  saveLocalProgress,
  saveLocalSpot,
  type LocalSpot,
} from "../_lib/local-mode";
import type { DailyHome, Reveal, Row } from "../_lib/types";
import { Confetti } from "./Confetti";
import { GameHeader } from "./GameHeader";
import { HowToPlay } from "./HowToPlay";
import { LocalModeModal } from "./LocalModeModal";
import { PropertyCard } from "./PropertyCard";
import { PropertyCardSkeleton } from "./PropertyCardSkeleton";
import { PropertyLeaderboard } from "./PropertyLeaderboard";

type HomeUI = {
  rows: Row[];
  lo: number;
  hi: number;
  t: number;
  exactMode: boolean;
  exact: string;
  reveal: Reveal | null;
};

const freshUI = (lo: number, hi: number): HomeUI => ({
  rows: [],
  lo,
  hi,
  t: 0.5,
  exactMode: true,
  exact: "",
  reveal: null,
});

// Local mode: an endless run of homes near the player's chosen spot. The queue
// is deterministic per (day, area) on the server, so progress re-attaches after
// a reload by simply re-requesting the same range. No slate, no streak — this is
// the casual counterpart to the daily Random mode.
export function LocalGame() {
  const [spot, setSpot] = useState<LocalSpot | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [date, setDate] = useState("");
  const [homes, setHomes] = useState<DailyHome[]>([]);
  const [ui, setUi] = useState<Record<number, HomeUI>>({});
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [bounds, setBounds] = useState({ floor: PRICE_MIN, ceiling: PRICE_MAX });

  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const prevDone = useRef(false);

  useEffect(() => {
    if (!celebrate) return;
    const id = setTimeout(() => setCelebrate(false), 4500);
    return () => clearTimeout(id);
  }, [celebrate]);

  const localUrl = (s: LocalSpot, start: number, count: number) =>
    `/api/local?lat=${s.lat}&lon=${s.lon}&start=${start}&count=${count}`;

  // Boot a run for `s`: first home + queue size, then any further homes the
  // player was already served today (their progress re-attaches by id).
  async function start(s: LocalSpot) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(localUrl(s, 0, 1));
      const data = await res.json();
      if (data.tooFar) {
        // The spot no longer resolves (e.g. pool rotated away from that area).
        setShowPicker(true);
        setLoading(false);
        return;
      }
      if (!res.ok || !data.homes?.length) throw new Error(data.error ?? "failed");

      const floor = typeof data.priceFloor === "number" ? data.priceFloor : PRICE_MIN;
      const ceiling = typeof data.priceCeiling === "number" ? data.priceCeiling : PRICE_MAX;
      setBounds({ floor, ceiling });
      setTotal(data.total ?? 0);
      setDate(data.date);

      let all: DailyHome[] = data.homes;
      const saved = loadLocalProgress(data.date, s);
      // Re-serve the rest of what they'd already been dealt today (batches of 10).
      for (let got = all.length; got < saved.ids.length; ) {
        const n = Math.min(10, saved.ids.length - got);
        const r = await fetch(localUrl(s, got, n));
        const b = await r.json();
        const batch: DailyHome[] = r.ok ? (b.homes ?? []) : [];
        if (!batch.length) break;
        all = [...all, ...batch];
        got += batch.length;
        if (batch.length < n) break;
      }

      const next: Record<number, HomeUI> = {};
      all.forEach((home, i) => {
        const slot = saved.ids[i] === home.propertyId ? saved.slots?.[i] : undefined;
        const rows = slot?.rows ?? [];
        const { lo, hi } = rows.reduce(
          (b, r) => narrowBounds(b.lo, b.hi, r.guess, r.direction, r.band as Band),
          { lo: floor, hi: ceiling },
        );
        const t = rows.length ? priceToT(rows[rows.length - 1].guess, lo, hi) : 0.5;
        next[i] = {
          ...freshUI(floor, ceiling),
          rows,
          lo,
          hi,
          t,
          exactMode: rows.length === 0,
          reveal: slot?.reveal ?? null,
        };
      });

      setHomes(all);
      setUi(next);
      const firstUnfinished = all.findIndex((_, i) => !next[i].reveal);
      setCurrent(firstUnfinished === -1 ? Math.max(0, all.length - 1) : firstUnfinished);
      prevDone.current = firstUnfinished === -1;
    } catch {
      setError("Couldn't load homes near you.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred (async) so the localStorage read lands after mount — reading it
    // during render would break SSR hydration.
    (async () => {
      const s = loadLocalSpot();
      if (s) {
        setSpot(s);
        await start(s);
      } else {
        setLoading(false);
        setShowPicker(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSpot = (s: LocalSpot) => {
    saveLocalSpot(s);
    setSpot(s);
    setHomes([]);
    setUi({});
    setCurrent(0);
    setSubmitError(null);
    start(s);
  };

  const home = homes[current];
  const cur = ui[current];
  const exhausted = total > 0 && homes.length >= total;
  const onLastLoaded = current === homes.length - 1;

  // Scroll the freshly-revealed home into view, mirroring the daily flow.
  const done = cur?.reveal != null;
  useEffect(() => {
    if (done && !prevDone.current && revealRef.current) {
      smoothScrollTo(revealRef.current.getBoundingClientRect().top + window.scrollY - 12);
    }
    prevDone.current = done;
  }, [done]);

  const pivot = cur ? tToPrice(cur.t, cur.lo, cur.hi) : 0;
  const guessValue = cur ? (cur.exactMode ? exactGuess(cur.exact, cur.lo, cur.hi) : pivot) : 0;

  const patch = (slot: number, p: Partial<HomeUI>) =>
    setUi((prev) => ({ ...prev, [slot]: { ...prev[slot], ...p } }));

  const applyUnit = (mult: number) => {
    if (!cur) return;
    const base = Number(cur.exact.replace(/[^0-9.]/g, "")) || 0;
    if (!base) return;
    patch(current, { exact: Math.min(cur.hi, Math.max(cur.lo, Math.round(base * mult))).toLocaleString() });
  };

  function goTo(index: number) {
    setCurrent(index);
    setSubmitError(null);
    prevDone.current = ui[index]?.reveal != null;
    if (topRef.current) smoothScrollTo(topRef.current.getBoundingClientRect().top + window.scrollY - 12);
  }

  async function nextHome() {
    if (!spot || loadingNext) return;
    setLoadingNext(true);
    try {
      const res = await fetch(localUrl(spot, homes.length, 1));
      const data = await res.json();
      const next: DailyHome | undefined = data.homes?.[0];
      if (!res.ok || !next) throw new Error(data.error ?? "failed");
      const index = homes.length;
      setHomes((prev) => [...prev, next]);
      patch(index, freshUI(bounds.floor, bounds.ceiling));
      goTo(index);
    } catch {
      setSubmitError("Couldn't fetch the next home. Try again.");
    } finally {
      setLoadingNext(false);
    }
  }

  async function submit() {
    if (!spot || !home || !cur || !Number.isFinite(guessValue) || guessValue <= 0) {
      setSubmitError("Pick a price first.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const name = localStorage.getItem("dillow:name")?.trim() || undefined;
      const res = await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: guessValue, id: getId(), propertyId: home.propertyId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");

      const newRow: Row = { guess: guessValue, band: data.band, direction: data.direction };
      const newRows = [...cur.rows, newRow];
      const ids = homes.map((h) => h.propertyId);

      if (!data.gameOver) {
        const { lo, hi } = narrowBounds(cur.lo, cur.hi, guessValue, data.direction as Row["direction"], data.band as Band);
        // Same post-guess behaviour as the daily game: slider parks on the guess
        // just made, and the typed blind guess flips to the slider exactly once.
        patch(current, {
          rows: newRows,
          lo,
          hi,
          t: priceToT(guessValue, lo, hi),
          exact: "",
          ...(cur.rows.length === 0 ? { exactMode: false } : {}),
        });
        saveLocalProgress(date, spot, ids, current, { rows: newRows, reveal: null });
        buzz(12);
        return;
      }

      const reveal: Reveal = {
        result: data.result,
        property: data.property,
        details: data.details,
        communityStats: data.communityStats,
        leaderboard: data.leaderboard,
      };
      const won = data.result?.within;
      buzz(won ? [0, 35, 45, 90] : [0, 30, 60, 30]);
      if (won) setCelebrate(true);

      patch(current, { rows: newRows, reveal });
      saveLocalProgress(date, spot, ids, current, { rows: newRows, reveal });

      recordStats({
        date,
        propertyId: home.propertyId,
        price: data.property.price,
        pct: Math.abs(data.result.pctError),
        attempts: data.result.attemptsUsed,
        won: data.result.within,
        state: data.property.state,
        city: data.property.city,
      });
      recordRecentHome({
        date,
        propertyId: home.propertyId,
        title: propertyTitle(home.clue),
        price: data.property.price,
        pct: Math.abs(data.result.pctError),
        won: data.result.within,
        url: data.details?.listingUrl ?? undefined,
        zillowUrl: data.details?.zillowUrl ?? undefined,
      });
    } catch {
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main ref={topRef} className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 sm:gap-5 sm:py-10">
      {celebrate && <Confetti />}
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      {showPicker && (
        <LocalModeModal onPick={pickSpot} onClose={() => setShowPicker(false)} />
      )}

      <GameHeader onHelp={() => setShowHelp(true)} />

      {spot && (
        <button
          onClick={() => setShowPicker(true)}
          className="mx-auto flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100"
        >
          <MapPin size={14} aria-hidden="true" />
          Playing in {spot.city}, {spot.state}
          <span className="text-xs font-medium text-sky-500">· change</span>
        </button>
      )}

      {loading && <PropertyCardSkeleton quips={["Scouting your neighborhood…", "Knocking on nearby doors…"]} />}
      {error && !loading && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
      )}

      {!loading && !spot && !showPicker && (
        <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">📍</p>
          <h1 className="mt-2 text-lg font-extrabold tracking-tight text-stone-800">Play homes near you</h1>
          <p className="mt-1 text-sm text-stone-500">Pick where to play and we&apos;ll deal you the area&apos;s homes.</p>
          <button
            onClick={() => setShowPicker(true)}
            className="mx-auto mt-4 block rounded-lg bg-emerald-600 px-6 py-2.5 font-semibold text-white transition hover:bg-emerald-700"
          >
            Choose a spot
          </button>
        </section>
      )}

      {!loading && home && cur && (
        <>
          <p className="text-center text-sm font-semibold text-stone-500">
            Home {current + 1} near {spot?.city}
          </p>
          <PropertyCard
            clue={home.clue}
            rows={cur.rows}
            done={done}
            remaining={MAX_ATTEMPTS - cur.rows.length}
            guessValue={guessValue}
            lo={cur.lo}
            hi={cur.hi}
            t={cur.t}
            exactMode={cur.exactMode}
            exact={cur.exact}
            submitting={submitting}
            error={submitError}
            reveal={cur.reveal}
            revealRef={revealRef}
            onSliderChange={(v) => patch(current, { t: v })}
            onExactModeChange={(v) => patch(current, { exactMode: v })}
            onExactChange={(v) => patch(current, { exact: v })}
            onApplyUnit={applyUnit}
            onSubmit={submit}
          />

          {cur.reveal && (
            <>
              <PropertyLeaderboard propertyId={home.propertyId} />
              {!onLastLoaded ? (
                <button
                  onClick={() => goTo(current + 1)}
                  className="self-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
                >
                  Next home →
                </button>
              ) : !exhausted ? (
                <button
                  onClick={nextHome}
                  disabled={loadingNext}
                  className="self-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {loadingNext ? "Finding a home…" : "Next home →"}
                </button>
              ) : (
                <section className="animate-reveal rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
                  <p className="text-2xl">🏁</p>
                  <h2 className="mt-1 text-lg font-extrabold tracking-tight text-emerald-900">
                    That&apos;s every home near {spot?.city} today
                  </h2>
                  <p className="mt-1 text-sm text-emerald-800">
                    Come back tomorrow, or play somewhere else.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      onClick={() => setShowPicker(true)}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Switch city
                    </button>
                    <Link
                      href="/"
                      className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Play Random mode
                    </Link>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
