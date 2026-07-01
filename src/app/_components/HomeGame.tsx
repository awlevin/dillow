"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { narrowBounds, type Band } from "@/lib/feedback";
import { buzz, smoothScrollTo } from "../_lib/browser-effects";
import { getId, loadStreak, recordPlay, recordRecentHome, recordStats } from "../_lib/client-storage";
import { formatPct, MAX_ATTEMPTS, parsePriceInput, PRICE_MAX, PRICE_MIN, propertyTitle, tToPrice } from "../_lib/format";
import { homeMeta } from "../_lib/slate";
import type { DailyHome, Reveal, Row } from "../_lib/types";
import { Confetti } from "./Confetti";
import { GameHeader } from "./GameHeader";
import { HowToPlay } from "./HowToPlay";
import { NextDrop } from "./NextDrop";
import { PropertyCard } from "./PropertyCard";
import { PropertyCardSkeleton } from "./PropertyCardSkeleton";
import { PropertyLeaderboard } from "./PropertyLeaderboard";
import { RecentHomes } from "./RecentHomes";
import { RecentRooms } from "./RecentRooms";
import { RecentRoomsMenu } from "./RecentRoomsMenu";
import { RoomInvite } from "./RoomInvite";
import { StatsPanel } from "./StatsPanel";

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
  exactMode: false,
  exact: "",
  reveal: null,
});

export function HomeGame() {
  const [date, setDate] = useState("");
  const [homes, setHomes] = useState<DailyHome[]>([]);
  const [ui, setUi] = useState<Record<number, HomeUI>>({});
  const [current, setCurrent] = useState(0);

  const [streak, setStreak] = useState(0);
  const [statsVersion, setStatsVersion] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Per-day, per-home progress survives reloads. Keyed by date; we also store the
  // served home ids so a changed slate (admin rotation, a different "local" pick)
  // resets just the slots whose home actually changed.
  const lsKey = (d: string) => `dillow:daily:${d}`;
  const loadLocal = (
    d: string,
  ): { ids?: string[]; slots?: Record<number, { rows: Row[]; reveal: Reveal | null }> } => {
    try {
      return JSON.parse(localStorage.getItem(lsKey(d)) ?? "{}");
    } catch {
      return {};
    }
  };
  const saveSlot = (d: string, served: DailyHome[], slot: number, rows: Row[], reveal: Reveal | null) => {
    const cur = loadLocal(d);
    const slots = cur.slots ?? {};
    slots[slot] = { rows, reveal };
    localStorage.setItem(lsKey(d), JSON.stringify({ ids: served.map((h) => h.propertyId), slots }));
  };

  useEffect(() => {
    (async () => {
      try {
        if (!localStorage.getItem("dillow:seenTutorial")) setShowHelp(true);
        setStreak(loadStreak());
        const res = await fetch("/api/daily");
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        const served: DailyHome[] = data.homes ?? [];
        setDate(data.date);
        setHomes(served);

        const floor = typeof data.priceFloor === "number" ? data.priceFloor : PRICE_MIN;
        const ceiling = typeof data.priceCeiling === "number" ? data.priceCeiling : PRICE_MAX;
        const local = loadLocal(data.date);
        const savedIds = local.ids ?? [];

        const next: Record<number, HomeUI> = {};
        served.forEach((home, i) => {
          // Only restore saved progress if this slot is still the same home.
          const saved = savedIds[i] === home.propertyId ? local.slots?.[i] : undefined;
          const rows = saved?.rows ?? [];
          const { lo, hi } = rows.reduce(
            (b, r) => narrowBounds(b.lo, b.hi, r.guess, r.direction, r.band as Band),
            { lo: floor, hi: ceiling },
          );
          next[i] = { ...freshUI(floor, ceiling), rows, lo, hi, reveal: saved?.reveal ?? null };
        });
        setUi(next);

        const firstUnfinished = served.findIndex((_, i) => !next[i].reveal);
        setCurrent(firstUnfinished === -1 ? served.length : firstUnfinished);
      } catch {
        setError("Couldn't load today's homes.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = homes.length;
  const onRecap = total > 0 && current >= total;
  const home = homes[current];
  const cur = ui[current];
  const allDone = total > 0 && homes.every((_, i) => ui[i]?.reveal);
  // Rooms (and per-home boards) need Redis; the reveal reports whether it's on.
  const lbEnabled = homes.some((_, i) => ui[i]?.reveal?.leaderboard?.enabled === true);

  // Scroll the freshly-revealed home into view, mirroring the single-home flow.
  const done = cur?.reveal != null;
  useEffect(() => {
    if (done && !prevDone.current && revealRef.current) {
      smoothScrollTo(revealRef.current.getBoundingClientRect().top + window.scrollY - 12);
    }
    prevDone.current = done;
  }, [done]);

  const pivot = cur ? tToPrice(cur.t, cur.lo, cur.hi) : 0;
  const guessValue = cur
    ? cur.exactMode
      ? Math.min(cur.hi, Math.max(cur.lo, parsePriceInput(cur.exact)))
      : pivot
    : 0;

  const patch = (slot: number, p: Partial<HomeUI>) =>
    setUi((prev) => ({ ...prev, [slot]: { ...prev[slot], ...p } }));

  const applyUnit = (mult: number) => {
    if (!cur) return;
    const base = parsePriceInput(cur.exact);
    if (!base) return;
    patch(current, { exact: Math.min(cur.hi, Math.max(cur.lo, Math.round(base * mult))).toLocaleString() });
  };

  async function submit() {
    if (!home || !cur || !Number.isFinite(guessValue) || guessValue <= 0) {
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

      if (!data.gameOver) {
        const { lo, hi } = narrowBounds(cur.lo, cur.hi, guessValue, data.direction as Row["direction"], data.band as Band);
        patch(current, { rows: newRows, lo, hi, t: 0.5, exact: "" });
        saveSlot(date, homes, current, newRows, null);
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

      patch(current, { rows: newRows, reveal, t: 0.5, exact: "" });
      saveSlot(date, homes, current, newRows, reveal);

      recordStats({
        date,
        propertyId: home.propertyId,
        price: data.property.price,
        pct: Math.abs(data.result.pctError),
        attempts: data.result.attemptsUsed,
        won: data.result.within,
        state: data.property.state,
      });
      recordRecentHome({
        date,
        propertyId: home.propertyId,
        title: data.property.address
          ? `${data.property.address}, ${data.property.city}, ${data.property.state}`
          : propertyTitle(home.clue),
        price: data.property.price,
        pct: Math.abs(data.result.pctError),
        won: data.result.within,
        url: data.details?.listingUrl ?? undefined,
      });
      setStatsVersion((v) => v + 1);

      // Finishing the last home completes the day → bump the streak (once/day).
      const finishedAll = homes.every((_, i) => (i === current ? true : ui[i]?.reveal));
      if (finishedAll) setStreak(recordPlay());
    } catch {
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goTo(index: number) {
    setCurrent(index);
    setSubmitError(null);
    prevDone.current = ui[index]?.reveal != null;
    if (topRef.current) smoothScrollTo(topRef.current.getBoundingClientRect().top + window.scrollY - 12);
  }

  const shareText = useMemo(() => {
    if (!home || !cur?.reveal) return "";
    const grid = cur.rows.map((r) => r.band).join("");
    const won = cur.reveal.result.within;
    const pct = formatPct(cur.reveal.result.pctError);
    const tries = won ? `${cur.rows.length}/${MAX_ATTEMPTS} 🎯` : `X/${MAX_ATTEMPTS}`;
    return `Dillow ${date} — ${homeMeta(home.kind).label} · ${tries} · ${pct}% off\n${grid}`;
  }, [home, cur, date]);

  return (
    <main ref={topRef} className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 sm:gap-5 sm:py-10">
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

      {loading && <PropertyCardSkeleton />}
      {error && !homes.length && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>
      )}

      {total > 0 && <SlateNav current={current} total={total} />}

      {!onRecap && home && cur && (
        <>
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
            shareText={shareText}
            onSliderChange={(v) => patch(current, { t: v })}
            onExactModeChange={(v) => patch(current, { exactMode: v })}
            onExactChange={(v) => patch(current, { exact: v })}
            onApplyUnit={applyUnit}
            onSubmit={submit}
          />

          {cur.reveal && (
            <>
              <PropertyLeaderboard propertyId={home.propertyId} />
              <button
                onClick={() => goTo(current + 1)}
                className="self-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                {current < total - 1
                  ? `Next home (${current + 2} of ${total}) →`
                  : "See your day →"}
              </button>
            </>
          )}
        </>
      )}

      {onRecap && (
        <>
          <DailyRecap homes={homes} ui={ui} streak={streak} onReplay={goTo} allDone={allDone} />
          {allDone && lbEnabled && <RoomInvite />}
          <RecentRooms />
          <StatsPanel version={statsVersion} />
          <NextDrop />
        </>
      )}

      {!loading && <RecentRoomsMenu />}
      {!loading && <RecentHomes />}
    </main>
  );
}

// A minimal progress indicator for the day's three homes. (Hidden on the recap.)
function SlateNav({ current, total }: { current: number; total: number }) {
  if (current >= total) return null;
  return (
    <p className="text-center text-sm font-semibold text-stone-500">
      Home {current + 1} of {total}
    </p>
  );
}

// End-of-day wrap-up once all three (or as many as were played) are revealed.
function DailyRecap({
  homes,
  ui,
  streak,
  onReplay,
  allDone,
}: {
  homes: DailyHome[];
  ui: Record<number, HomeUI>;
  streak: number;
  onReplay: (index: number) => void;
  allDone: boolean;
}) {
  const reveals = homes.map((_, i) => ui[i]?.reveal).filter((r): r is Reveal => r != null);
  const playedCount = reveals.length;
  const wins = reveals.filter((r) => r.result.within).length;

  return (
    <section className="animate-reveal rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
      <p className="text-2xl">🏁</p>
      <h2 className="mt-1 text-lg font-extrabold tracking-tight text-emerald-900">
        {allDone ? "That's all three homes!" : "Your homes today"}
      </h2>
      <p className="mt-2 text-sm text-emerald-800">
        You nailed <span className="font-bold">{wins}</span> of {playedCount}{" "}
        {playedCount === 1 ? "home" : "homes"} within 1%
        {streak > 0 && (
          <>
            {" "}
            · <span className="font-bold">🔥 {streak}-day streak</span>
          </>
        )}
        .
      </p>

      <div className="mt-4 flex flex-col gap-2 text-left">
        {homes.map((h, i) => {
          const r = ui[i]?.reveal;
          const meta = homeMeta(h.kind);
          return (
            <button
              key={h.propertyId + i}
              onClick={() => onReplay(i)}
              className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm transition hover:border-emerald-300"
            >
              <span className="flex items-center gap-2 text-stone-700">
                <span>{meta.emoji}</span>
                <span className="font-semibold">{meta.label}</span>
                <span className="text-stone-400">
                  {h.clue.city}, {h.clue.state}
                </span>
              </span>
              <span className="shrink-0 text-stone-500">
                {r ? (
                  <>
                    {r.result.within ? "🎯 " : ""}
                    {formatPct(r.result.pctError)}% off
                  </>
                ) : (
                  "—"
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
