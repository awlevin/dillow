"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Trophy } from "lucide-react";
import { narrowBounds, type Band } from "@/lib/feedback";
import { buzz, shareOrCopy, smoothScrollTo } from "../_lib/browser-effects";
import { getId, recordRecentHome, recordRoom } from "../_lib/client-storage";
import { isoDay } from "../_lib/game-day";
import { MAX_ATTEMPTS, parsePriceInput, PRICE_MAX, PRICE_MIN, propertyTitle, tToPrice, usd } from "../_lib/format";
import type { Reveal, RoomInfo, RoomMemberView, RoomRound, Row } from "../_lib/types";
import { Confetti } from "./Confetti";
import { PropertyCard } from "./PropertyCard";
import { PropertyCardSkeleton } from "./PropertyCardSkeleton";

type RoundUI = {
  rows: Row[];
  lo: number;
  hi: number;
  t: number;
  exactMode: boolean;
  exact: string;
  reveal: Reveal | null;
};

const rankBadge = (rank: number) =>
  rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

export function RoomGame({ roomId }: { roomId: string }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ui, setUi] = useState<Record<number, RoundUI>>({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const inited = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!celebrate) return;
    const id = setTimeout(() => setCelebrate(false), 4500);
    return () => clearTimeout(id);
  }, [celebrate]);

  const lsKey = `dillow:room:${roomId}`;
  const loadLocal = (): Record<number, { rows: Row[]; reveal: Reveal | null }> => {
    try {
      return JSON.parse(localStorage.getItem(lsKey) ?? "{}");
    } catch {
      return {};
    }
  };
  const saveLocal = (round: number, rows: Row[], reveal: Reveal | null) => {
    const cur = loadLocal();
    cur[round] = { rows, reveal };
    localStorage.setItem(lsKey, JSON.stringify(cur));
  };

  // Re-fetch room info (board, finished-round reveals) without touching the
  // interactive round UI (guarded by `inited`).
  const refresh = async (playerId: string) => {
    const res = await fetch(`/api/room/${roomId}?id=${encodeURIComponent(playerId)}`);
    const data: RoomInfo = await res.json();
    return data;
  };

  // Seed the per-round interactive state once, from the server view + any locally
  // saved progress (rows/reveal), and jump to the first unfinished round.
  function initRounds(data: RoomInfo) {
    if (inited.current) return;
    inited.current = true;
    const floor = data.priceFloor ?? PRICE_MIN;
    const ceiling = data.priceCeiling ?? PRICE_MAX;
    const local = loadLocal();
    const next: Record<number, RoundUI> = {};
    const rounds = data.rounds ?? [];
    for (const r of rounds) {
      const saved = local[r.index];
      const rows: Row[] = saved?.rows ?? [];
      // Rebuild the narrowed slider bounds by folding each saved guess from base.
      const { lo, hi } = rows.reduce(
        (b, row) => narrowBounds(b.lo, b.hi, row.guess, row.direction, row.band as Band),
        { lo: floor, hi: ceiling },
      );
      const reveal: Reveal | null = r.done && r.property && r.result
        ? { result: r.result, property: r.property, details: r.details, communityStats: r.communityStats }
        : (saved?.reveal ?? null);
      next[r.index] = { rows, lo, hi, t: 0.5, exactMode: false, exact: "", reveal };
    }
    setUi(next);
    const firstUnfinished = rounds.find((r) => !r.done);
    setCurrent(firstUnfinished ? firstUnfinished.index : rounds.length);
  }

  useEffect(() => {
    recordRoom(roomId, new Date().toISOString().slice(0, 10));

    (async () => {
      const playerId = getId();
      const savedName = localStorage.getItem("dillow:name") ?? "";
      setId(playerId);
      setName(savedName);
      try {
        const data = await refresh(playerId);
        if (!data?.enabled) {
          setError("Challenge rooms aren't available right now.");
          return;
        }
        if (data.error || !data.room || !data.rounds) {
          setError(data.error ?? "This room could not be found.");
          return;
        }
        initRounds(data);
        setInfo(data);
        if (data.room.name) recordRoom(roomId, data.room.date, `${data.room.name}’s room`);

        if (savedName) {
          // Already named — register on the board, then sync.
          await fetch(`/api/room/${roomId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "join", id: playerId, name: savedName }),
          });
          setInfo(await refresh(playerId));
        } else {
          setNeedName(true);
        }
      } catch {
        setError("Couldn't load this room.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const roundCount = info?.room?.roundCount ?? 0;
  const cur = ui[current];

  const pivot = cur ? tToPrice(cur.t, cur.lo, cur.hi) : 0;
  const guessValue = cur
    ? cur.exactMode
      ? Math.min(cur.hi, Math.max(cur.lo, parsePriceInput(cur.exact)))
      : pivot
    : 0;

  const patch = (round: number, p: Partial<RoundUI>) =>
    setUi((prev) => ({ ...prev, [round]: { ...prev[round], ...p } }));

  const applyUnit = (mult: number) => {
    if (!cur) return;
    const base = parsePriceInput(cur.exact);
    if (!base) return;
    patch(current, { exact: Math.min(cur.hi, Math.max(cur.lo, Math.round(base * mult))).toLocaleString() });
  };

  async function joinWithName(n: string) {
    const trimmed = n.trim();
    if (!trimmed) return;
    localStorage.setItem("dillow:name", trimmed);
    setName(trimmed);
    setNeedName(false);
    await fetch(`/api/room/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", id, name: trimmed }),
    });
    setInfo(await refresh(id));
  }

  // The creator can retitle their room from the header; the title follows their name.
  async function renameRoom(next: string) {
    const trimmed = next.trim().slice(0, 24);
    localStorage.setItem("dillow:name", trimmed);
    setName(trimmed);
    await fetch(`/api/room/${roomId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", id, name: trimmed }),
    });
    if (info?.room) recordRoom(roomId, info.room.date, trimmed ? `${trimmed}’s room` : undefined);
    setInfo(await refresh(id));
  }

  async function submit() {
    if (!cur || !Number.isFinite(guessValue) || guessValue <= 0) {
      setSubmitError("Pick a price first.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/room/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attempt", id, name, round: current, guess: guessValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");

      const newRow: Row = { guess: guessValue, band: data.band, direction: data.direction };
      const newRows = [...cur.rows, newRow];

      if (!data.gameOver) {
        const { lo, hi } = narrowBounds(cur.lo, cur.hi, guessValue, data.direction, data.band as Band);
        patch(current, { rows: newRows, lo, hi, t: 0.5, exact: "" });
        saveLocal(current, newRows, null);
        buzz(12);
      } else {
        const reveal: Reveal = {
          result: data.result,
          property: data.property,
          details: data.details,
          communityStats: data.communityStats,
        };
        patch(current, { rows: newRows, reveal });
        saveLocal(current, newRows, reveal);
        buzz(data.result?.within ? [0, 35, 45, 90] : [0, 30, 60, 30]);
        if (data.result?.within) setCelebrate(true);

        recordRecentHome({
          date: info?.room?.date ?? isoDay(new Date()),
          propertyId: data.property.id,
          title: data.property.address
            ? `${data.property.address}, ${data.property.city}, ${data.property.state}`
            : propertyTitle(data.property),
          price: data.property.price,
          pct: Math.abs(data.result.pctError),
          won: data.result.within,
          url: data.details?.listingUrl ?? undefined,
        });

        setInfo(await refresh(id));
      }
    } catch {
      setSubmitError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goToRound(next: number) {
    setCurrent(next);
    setSubmitError(null);
    if (topRef.current) smoothScrollTo(topRef.current.getBoundingClientRect().top + window.scrollY - 12);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 sm:gap-5 sm:py-10">
        <PropertyCardSkeleton
          quips={[
            "Setting up the challenge…",
            "Lining up 3 homes…",
            "Polishing the leaderboard…",
            "Saving you a seat…",
          ]}
        />
      </main>
    );
  }
  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="text-stone-600">{error}</p>
        <Link href="/" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          Play today&apos;s home
        </Link>
      </main>
    );
  }

  const rounds = info?.rounds ?? [];
  const board = info?.board ?? [];
  const myRank = board.findIndex((m) => m.id === id);
  const shareText = cur?.reveal ? roundShareText(current, roundCount, cur) : "";

  return (
    <main ref={topRef} className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 sm:gap-5 sm:py-10">
      {celebrate && <Confetti />}
      <RoomHeader
        roomId={roomId}
        roomName={info?.room?.name ?? ""}
        canEdit={info?.isOwner === true}
        onRename={renameRoom}
      />

      {needName ? (
        <JoinGate initial={name} onJoin={joinWithName} />
      ) : current < roundCount && cur && rounds[current] ? (
        <>
          <RoundDots current={current} total={roundCount} />
          <PropertyCard
            clue={rounds[current].clue}
            rows={cur.rows}
            done={cur.reveal !== null}
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
            <button
              onClick={() => goToRound(current + 1)}
              className="self-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              {current < roundCount - 1 ? `Next round (${current + 2} of ${roundCount}) →` : "See final standings →"}
            </button>
          )}
        </>
      ) : (
        <FinalRecap me={myRank >= 0 ? board[myRank] : (info?.me ?? null)} rank={myRank >= 0 ? myRank + 1 : null} roundCount={roundCount} />
      )}

      {!needName && <RoomBoard board={board} myId={id} roundCount={roundCount} />}
      {!needName && <RoomHistory rounds={rounds} board={board} myId={id} hideIndex={current < roundCount ? current : null} />}

      <footer className="text-center">
        <Link href="/" className="text-xs text-stone-400 hover:text-emerald-600">
          ← Back to today&apos;s daily home
        </Link>
      </footer>
    </main>
  );
}

function roundShareText(roundIdx: number, roundCount: number, ui: RoundUI): string {
  if (!ui.reveal) return "";
  const grid = ui.rows.map((r) => r.band).join("");
  const won = ui.reveal.result.within;
  const pct = Math.round(Math.abs(ui.reveal.result.pctError) * 100);
  const tries = won ? `${ui.rows.length}/${MAX_ATTEMPTS} 🎯` : `X/${MAX_ATTEMPTS}`;
  return `Dillow Challenge — Round ${roundIdx + 1}/${roundCount} · ${tries} · ${pct}% off\n${grid}`;
}

function RoomHeader({
  roomId,
  roomName,
  canEdit,
  onRename,
}: {
  roomId: string;
  roomName: string;
  canEdit: boolean;
  onRename: (name: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(roomName);
  const [saving, setSaving] = useState(false);
  const title = roomName ? `${roomName}’s room` : "Challenge room";

  const invite = async () => {
    const url = `${window.location.origin}/r/${roomId}`;
    const message = `Join ${title} on Dillow — a lightning round, head to head.`;
    if ((await shareOrCopy(message, url)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    await onRename(draft);
    setSaving(false);
    setEditing(false);
  };

  return (
    <header className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-amber-800">
        <Trophy size={18} className="shrink-0" aria-hidden="true" />
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Name your room"
            maxLength={24}
            autoFocus
            aria-label="Room name"
            className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm font-semibold outline-none focus:border-emerald-500"
          />
        ) : (
          <>
            <span className="truncate text-sm font-bold">{title}</span>
            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-xs text-stone-500">{roomId}</span>
            {canEdit && (
              <button
                onClick={() => {
                  setDraft(roomName);
                  setEditing(true);
                }}
                aria-label="Rename room"
                title="Rename room"
                className="shrink-0 text-amber-500 transition hover:text-amber-700"
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
      {editing ? (
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
      ) : (
        <button
          onClick={invite}
          className="shrink-0 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          {copied ? "Link copied!" : "Invite"}
        </button>
      )}
    </header>
  );
}

function JoinGate({ initial, onJoin }: { initial: string; onJoin: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 text-center shadow-sm">
      <h1 className="text-lg font-extrabold tracking-tight text-stone-800">Join the challenge</h1>
      <p className="mt-1 text-sm text-stone-500">
        Pick a name so your friends can see you on the room leaderboard.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onJoin(value)}
          placeholder="Your name"
          maxLength={24}
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => onJoin(value)}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Play
        </button>
      </div>
    </section>
  );
}

function RoundDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-stone-500">
      <span>Round {current + 1} of {total}</span>
      <span className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < current ? "bg-emerald-500" : i === current ? "bg-amber-400" : "bg-stone-200"}`}
          />
        ))}
      </span>
    </div>
  );
}

function RoomBoard({ board, myId, roundCount }: { board: RoomMemberView[]; myId: string; roundCount: number }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Room leaderboard</h2>
      {board.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-1">
          {board.map((m, i) => {
            const me = m.id === myId;
            return (
              <li
                key={m.id}
                className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${me ? "bg-emerald-50 font-semibold text-emerald-800" : ""}`}
              >
                <span className={me ? "" : "text-stone-700"}>
                  <span className={`inline-block w-7 font-bold ${me ? "text-emerald-500" : "text-stone-400"}`}>
                    {rankBadge(i + 1)}
                  </span>
                  {m.name}
                  {me && <span className="ml-1 text-xs font-medium text-emerald-600">(you)</span>}
                </span>
                <span className={me ? "text-emerald-700" : "text-stone-500"}>
                  {m.total} pts · {m.roundsDone}/{roundCount}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-stone-400">No scores yet — play a round to get on the board.</p>
      )}
    </section>
  );
}

function RoomHistory({
  rounds,
  board,
  myId,
  hideIndex,
}: {
  rounds: RoomRound[];
  board: RoomMemberView[];
  myId: string;
  hideIndex: number | null;
}) {
  const finished = rounds.filter((r) => r.done && r.property && r.index !== hideIndex);
  if (finished.length === 0) return null;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Round history</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {finished.map((r) => {
          const mine = board.find((m) => m.id === myId)?.rounds?.[r.index] ?? null;
          // Best score on this round across the room.
          const best = board.reduce<{ name: string; score: number } | null>((acc, m) => {
            const s = m.rounds?.[r.index];
            if (s && (!acc || s.score > acc.score)) return { name: m.name, score: s.score };
            return acc;
          }, null);
          return (
            <li key={r.index} className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50 p-2.5">
              {r.property!.photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.property!.photos[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-700">
                  Round {r.index + 1} · {r.property!.city}, {r.property!.state}
                </p>
                <p className="text-xs text-stone-500">
                  Actual {usd(r.property!.price)}
                  {mine && <> · you {Math.round(Math.abs(mine.pct) * 100)}% off ({mine.score} pts)</>}
                </p>
                {best && (
                  <p className="text-xs text-amber-600">
                    🏆 Best: {best.name} ({best.score} pts)
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FinalRecap({ me, rank, roundCount }: { me: RoomMemberView | null; rank: number | null; roundCount: number }) {
  return (
    <section className="animate-reveal rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
      <p className="text-2xl">🏁</p>
      <h2 className="mt-1 text-lg font-extrabold tracking-tight text-emerald-900">All {roundCount} rounds done!</h2>
      {me ? (
        <p className="mt-2 text-sm text-emerald-800">
          You scored <span className="font-bold">{me.total} pts</span>
          {rank ? <> — currently <span className="font-bold">{rankBadge(rank)}</span> in the room</> : null}.
        </p>
      ) : (
        <p className="mt-2 text-sm text-emerald-800">Your scores are in — check the leaderboard below.</p>
      )}
      <p className="mt-3 text-xs text-stone-500">
        Invite more friends and they&apos;ll play the same homes — the board updates as they finish.
      </p>
    </section>
  );
}
