"use client";

import { useEffect, useRef, useState } from "react";
import { narrowBounds, WIN_LABEL, type Band } from "@/lib/feedback";
import { buzz, shareOrCopy, smoothScrollTo } from "../_lib/browser-effects";
import { getId, loadStreak, recordPlay, recordRecentHome, recordStats } from "../_lib/client-storage";
import { exactGuess, formatPct, MAX_ATTEMPTS, parsePriceInput, PRICE_MAX, PRICE_MIN, priceToT, propertyTitle, tToPrice } from "../_lib/format";
import { homeMeta } from "../_lib/slate";
import type { DailyHome, Reveal, Row } from "../_lib/types";
import { Confetti } from "./Confetti";
import { GameHeader } from "./GameHeader";
import { HowToPlay } from "./HowToPlay";
import { NextDrop } from "./NextDrop";
import { PropertyCard } from "./PropertyCard";
import { PropertyCardSkeleton } from "./PropertyCardSkeleton";
import { PropertyLeaderboard } from "./PropertyLeaderboard";
import { RecentRooms } from "./RecentRooms";
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

// A fresh home opens in manual entry for the blind first guess; after that
// first guess the UI switches to the slider once (see submit) and then leaves
// the choice to the player.
const freshUI = (lo: number, hi: number): HomeUI => ({
  rows: [],
  lo,
  hi,
  t: 0.5,
  exactMode: true,
  exact: "",
  reveal: null,
});

export function HomeGame() {
  const [date, setDate] = useState("");
  const [homes, setHomes] = useState<DailyHome[]>([]);
  const [ui, setUi] = useState<Record<number, HomeUI>>({});
  const [current, setCurrent] = useState(0);
  // The size of the day's slate (the classic three). Homes past it are bonus
  // homes, available while the 3-per-day limit flag is off (`unlimited`).
  const [slateSize, setSlateSize] = useState(0);
  const [unlimited, setUnlimited] = useState(false);
  const [bounds, setBounds] = useState({ floor: PRICE_MIN, ceiling: PRICE_MAX });
  const [loadingBonus, setLoadingBonus] = useState(false);

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
        const noLimit = data.unlimited === true;
        setUnlimited(noLimit);
        setSlateSize(served.length);

        const floor = typeof data.priceFloor === "number" ? data.priceFloor : PRICE_MIN;
        const ceiling = typeof data.priceCeiling === "number" ? data.priceCeiling : PRICE_MAX;
        setBounds({ floor, ceiling });
        const local = loadLocal(data.date);
        const savedIds = local.ids ?? [];

        // Re-serve any bonus homes played earlier today so their progress
        // re-attaches — the bonus queue is deterministic per day, so asking for
        // the same range returns the same homes. Best-effort: a failure here
        // still leaves the slate playable.
        let all: DailyHome[] = [...served];
        const bonusCount = noLimit ? Math.max(0, savedIds.length - served.length) : 0;
        if (bonusCount > 0) {
          try {
            const exclude = served.map((h) => h.propertyId).join(",");
            for (let got = 0; got < bonusCount; ) {
              const n = Math.min(10, bonusCount - got);
              const r = await fetch(`/api/daily/bonus?exclude=${exclude}&start=${got}&count=${n}`);
              const b = await r.json();
              const batch: DailyHome[] = r.ok ? (b.homes ?? []) : [];
              if (!batch.length) break;
              all = [...all, ...batch];
              got += batch.length;
              if (batch.length < n) break;
            }
          } catch {
            /* slate still loads */
          }
        }
        setDate(data.date);
        setHomes(all);

        const next: Record<number, HomeUI> = {};
        all.forEach((home, i) => {
          // Only restore saved progress if this slot is still the same home.
          const saved = savedIds[i] === home.propertyId ? local.slots?.[i] : undefined;
          const rows = saved?.rows ?? [];
          const { lo, hi } = rows.reduce(
            (b, r) => narrowBounds(b.lo, b.hi, r.guess, r.direction, r.band as Band),
            { lo: floor, hi: ceiling },
          );
          // Park the slider on the last guess so a reload doesn't jump the value.
          const t = rows.length ? priceToT(rows[rows.length - 1].guess, lo, hi) : 0.5;
          next[i] = {
            ...freshUI(floor, ceiling),
            rows,
            lo,
            hi,
            t,
            exactMode: rows.length === 0,
            reveal: saved?.reveal ?? null,
          };
        });
        setUi(next);

        const firstUnfinished = all.findIndex((_, i) => !next[i].reveal);
        setCurrent(firstUnfinished === -1 ? all.length : firstUnfinished);
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
  // "Done for the day" means the SLATE is done — bonus homes never gate it.
  const allDone = slateSize > 0 && homes.slice(0, slateSize).every((_, i) => ui[i]?.reveal);
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
  const guessValue = cur ? (cur.exactMode ? exactGuess(cur.exact, cur.lo, cur.hi) : pivot) : 0;

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
        // Keep the slider on the guess just made (now an edge of the narrowed
        // range) so the value doesn't mysteriously jump to a new midpoint. The
        // first guess (typed blind) also flips to the slider — once; after that
        // the mode is the player's to choose.
        patch(current, {
          rows: newRows,
          lo,
          hi,
          t: priceToT(guessValue, lo, hi),
          exact: "",
          ...(cur.rows.length === 0 ? { exactMode: false } : {}),
        });
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
      setStatsVersion((v) => v + 1);

      // Finishing the slate completes the day → bump the streak (once/day).
      // Bonus homes don't count toward (or against) it.
      const finishedSlate = homes
        .slice(0, slateSize)
        .every((_, i) => (i === current ? true : ui[i]?.reveal));
      if (finishedSlate) setStreak(recordPlay());
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

  // Pull the next bonus home off the day's deterministic queue and jump to it.
  async function addBonusHome() {
    if (loadingBonus) return;
    setLoadingBonus(true);
    try {
      const exclude = homes
        .slice(0, slateSize)
        .map((h) => h.propertyId)
        .join(",");
      const res = await fetch(
        `/api/daily/bonus?exclude=${exclude}&start=${homes.length - slateSize}&count=1`,
      );
      const data = await res.json();
      const bonus: DailyHome | undefined = data.homes?.[0];
      if (!res.ok || !bonus) throw new Error(data.error ?? "failed");
      const index = homes.length;
      setHomes((prev) => [...prev, bonus]);
      patch(index, freshUI(bounds.floor, bounds.ceiling));
      goTo(index);
    } catch {
      setSubmitError("Couldn't fetch a bonus home. Try again.");
    } finally {
      setLoadingBonus(false);
    }
  }

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

      {total > 0 && <SlateNav current={current} total={total} slateSize={slateSize} />}

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
                  ? current + 1 >= slateSize
                    ? "Next bonus home →"
                    : `Next home (${current + 2} of ${slateSize}) →`
                  : "See your day →"}
              </button>
            </>
          )}
        </>
      )}

      {onRecap && (
        <>
          <DailyRecap homes={homes} ui={ui} streak={streak} date={date} onReplay={goTo} allDone={allDone} />
          {unlimited && (
            <>
              <button
                onClick={addBonusHome}
                disabled={loadingBonus}
                className="self-center rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
              >
                {loadingBonus ? "Finding a home…" : "🎁 Keep playing — bonus home"}
              </button>
              {submitError && <p className="text-center text-sm text-red-600">{submitError}</p>}
            </>
          )}
          {allDone && lbEnabled && <RoomInvite />}
          <RecentRooms />
          <StatsPanel version={statsVersion} />
          <NextDrop />
        </>
      )}
    </main>
  );
}

// A minimal progress indicator for the day's three homes — bonus homes past the
// slate count themselves instead. (Hidden on the recap.)
function SlateNav({ current, total, slateSize }: { current: number; total: number; slateSize: number }) {
  if (current >= total) return null;
  return (
    <p className="text-center text-sm font-semibold text-stone-500">
      {current < slateSize ? `Home ${current + 1} of ${slateSize}` : `Bonus home #${current - slateSize + 1}`}
    </p>
  );
}

// End-of-day wrap-up once all three (or as many as were played) are revealed.
function DailyRecap({
  homes,
  ui,
  streak,
  date,
  onReplay,
  allDone,
}: {
  homes: DailyHome[];
  ui: Record<number, HomeUI>;
  streak: number;
  date: string;
  onReplay: (index: number) => void;
  allDone: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const reveals = homes.map((_, i) => ui[i]?.reveal).filter((r): r is Reveal => r != null);
  const playedCount = reveals.length;
  const wins = reveals.filter((r) => r.result.within).length;

  // A spoiler-free day summary: one line per home (kind emoji + how close), with a
  // header carrying the date, win count, and streak. No prices, so it's shareable.
  const shareText = () => {
    const lines = homes
      .map((h, i) => {
        const r = ui[i]?.reveal;
        if (!r) return null;
        return `${homeMeta(h.kind).emoji} ${r.result.within ? "🎯 " : ""}${formatPct(r.result.pctError)}% off`;
      })
      .filter(Boolean);
    const streakBit = streak > 0 ? ` · 🔥 ${streak}` : "";
    return [`Dillow ${date} — ${wins}/${playedCount} within ${WIN_LABEL}${streakBit}`, ...lines].join("\n");
  };

  return (
    <section className="animate-reveal rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
      <p className="text-2xl">🏁</p>
      <h2 className="mt-1 text-lg font-extrabold tracking-tight text-emerald-900">
        {allDone ? "That's all three homes!" : "Your homes today"}
      </h2>
      <p className="mt-2 text-sm text-emerald-800">
        You nailed <span className="font-bold">{wins}</span> of {playedCount}{" "}
        {playedCount === 1 ? "home" : "homes"} within {WIN_LABEL}
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

      <button
        onClick={async () => {
          if ((await shareOrCopy(shareText(), window.location.href)) === "copied") {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="mx-auto mt-5 block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
      >
        {copied ? "Copied!" : "Share results"}
      </button>
    </section>
  );
}
