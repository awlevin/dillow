"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { narrowBounds, type Band } from "@/lib/feedback";
import { buzz, smoothScrollTo } from "../_lib/browser-effects";
import { getId, loadStreak, recordPlay, recordStats } from "../_lib/client-storage";
import { MAX_ATTEMPTS, parsePriceInput, PRICE_MAX, PRICE_MIN, tToPrice } from "../_lib/format";
import type { Clue, Reveal, Row } from "../_lib/types";
import { useFlag } from "../_lib/flags";
import { Confetti } from "./Confetti";
import { GameHeader } from "./GameHeader";
import { HowToPlay } from "./HowToPlay";
import { NextDrop } from "./NextDrop";
import { PropertyCard } from "./PropertyCard";
import { RecentRooms } from "./RecentRooms";
import { RoomInvite } from "./RoomInvite";
import { StatsPanel } from "./StatsPanel";
import { Leaderboard } from "./Leaderboard";

export function HomeGame() {
  const [date, setDate] = useState("");
  const [clue, setClue] = useState<Clue | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [lo, setLo] = useState(PRICE_MIN);
  const [hi, setHi] = useState(PRICE_MAX);
  const [t, setT] = useState(0.5);
  const [exactMode, setExactMode] = useState(false);
  const [exact, setExact] = useState("");
  const [streak, setStreak] = useState(0);
  const [statsVersion, setStatsVersion] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const revealRef = useRef<HTMLDivElement>(null);
  const prevDone = useRef(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [showNextDrop, setShowNextDrop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const roomsFlag = useFlag("rooms");

  useEffect(() => {
    if (!celebrate) return;
    const id = setTimeout(() => setCelebrate(false), 4500);
    return () => clearTimeout(id);
  }, [celebrate]);

  useEffect(() => {
    (async () => {
      try {
        if (!localStorage.getItem("dillow:seenTutorial")) setShowHelp(true);
        setStreak(loadStreak());
        const res = await fetch("/api/daily");
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        setDate(data.date);
        setClue(data.property);

        const floor = typeof data.priceFloor === "number" ? data.priceFloor : PRICE_MIN;
        const ceiling = typeof data.priceCeiling === "number" ? data.priceCeiling : PRICE_MAX;
        const saved = localStorage.getItem(`dillow:game:${data.date}`);

        if (saved) {
          const g = JSON.parse(saved);
          const savedRows: Row[] = g.rows ?? [];
          setRows(savedRows);
          setReveal(g.reveal ?? null);
          if (g.reveal) {
            prevDone.current = true;
            setShowNextDrop(true);
          }

          let b = { lo: floor, hi: ceiling };
          for (const r of savedRows) {
            b = narrowBounds(b.lo, b.hi, r.guess, r.direction, r.band as Band);
          }
          setLo(b.lo);
          setHi(b.hi);
        } else {
          setLo(floor);
          setHi(ceiling);
        }
      } catch {
        setError("Couldn't load today's home.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const done = reveal !== null;

  useEffect(() => {
    if (done && !prevDone.current) {
      if (revealRef.current) {
        smoothScrollTo(revealRef.current.getBoundingClientRect().top + window.scrollY - 12);
      }
      const t = setTimeout(() => setShowNextDrop(true), 2800);
      prevDone.current = done;
      return () => clearTimeout(t);
    }
    prevDone.current = done;
  }, [done]);

  const remaining = MAX_ATTEMPTS - rows.length;
  const pivot = useMemo(() => tToPrice(t, lo, hi), [t, lo, hi]);
  const guessValue = exactMode
    ? Math.min(hi, Math.max(lo, parsePriceInput(exact)))
    : pivot;

  const applyUnit = (mult: number) => {
    const base = parsePriceInput(exact);
    if (!base) return;
    setExact(Math.min(hi, Math.max(lo, Math.round(base * mult))).toLocaleString());
  };

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
      let nLo = lo;
      let nHi = hi;
      if (!data.gameOver) {
        ({ lo: nLo, hi: nHi } = narrowBounds(
          lo,
          hi,
          guessValue,
          data.direction as Row["direction"],
          data.band as Band,
        ));
      }
      const newReveal: Reveal | null = data.gameOver
        ? { result: data.result, property: data.property, leaderboard: data.leaderboard }
        : null;

      const won = data.gameOver && data.result?.within;
      buzz(won ? [0, 35, 45, 90] : data.gameOver ? [0, 30, 60, 30] : 12);
      if (won) setCelebrate(true);

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
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 sm:gap-5 sm:py-10">
      {celebrate && <Confetti />}
      {showHelp && (
        <HowToPlay
          onClose={() => {
            setShowHelp(false);
            localStorage.setItem("dillow:seenTutorial", "1");
          }}
        />
      )}

      <GameHeader onHelp={() => setShowHelp(true)} />

      {loading && <p className="text-center text-stone-400">Loading today&apos;s home…</p>}
      {error && !clue && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
      )}

      {clue && (
        <PropertyCard
          clue={clue}
          rows={rows}
          done={done}
          remaining={remaining}
          guessValue={guessValue}
          lo={lo}
          hi={hi}
          t={t}
          exactMode={exactMode}
          exact={exact}
          submitting={submitting}
          error={error}
          reveal={reveal}
          revealRef={revealRef}
          shareText={shareText}
          onSliderChange={setT}
          onExactModeChange={setExactMode}
          onExactChange={setExact}
          onApplyUnit={applyUnit}
          onSubmit={submit}
        />
      )}

      {done && roomsFlag && reveal?.leaderboard?.enabled && <RoomInvite />}

      {done && <RecentRooms />}

      {done && showNextDrop && <NextDrop />}

      {done && <Leaderboard streak={streak} />}
      {done && <StatsPanel version={statsVersion} />}

      <footer className="text-center">
        <p className="text-xs text-stone-400">Real listings from across the US via realtor.com.</p>
      </footer>
    </main>
  );
}
