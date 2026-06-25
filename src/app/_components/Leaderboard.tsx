"use client";

import { useEffect, useRef, useState } from "react";
import { getId } from "../_lib/client-storage";
import { formatPct, MAX_ATTEMPTS } from "../_lib/format";
import type { LeaderboardBoard, LeaderboardEntry } from "../_lib/types";

const rankBadge = (rank: number) =>
  rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;

export function Leaderboard({ streak }: { streak: number }) {
  const [board, setBoard] = useState<LeaderboardBoard | null>(null);

  useEffect(() => {
    const id = getId();
    const load = () =>
      fetch(`/api/leaderboard?id=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then(setBoard)
        .catch(() => setBoard({ enabled: false }));
    load();
    // Refetch when the player joins so their placement appears without a reload.
    window.addEventListener("dillow:leaderboard-changed", load);
    return () => window.removeEventListener("dillow:leaderboard-changed", load);
  }, []);

  if (!board?.enabled) return null;
  const { top = [], count = 0, me } = board;

  const myId = me?.entry?.id ?? null;
  // If the player already shows up in the top 5, don't repeat them below it.
  const meInTop = myId ? top.some((e) => e.id === myId) : false;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          Today&apos;s leaderboard
        </h2>
        {streak > 0 && (
          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-sm font-bold text-orange-600">
            🔥 {streak}-day streak
          </span>
        )}
      </div>

      {top.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-1">
          {top.map((e, i) => (
            <LeaderRow key={e.id} rank={i + 1} entry={e} me={e.id === myId} />
          ))}
          {me && !meInTop && (
            <>
              <li className="py-0.5 text-center text-stone-300" aria-hidden>
                ···
              </li>
              <LeaderRow rank={me.rank} entry={me.entry} me />
            </>
          )}
          <li className="mt-1 text-xs text-stone-400">
            {me
              ? `You placed #${me.rank} of ${count} ${count === 1 ? "player" : "players"} today`
              : `${count} ${count === 1 ? "player has" : "players have"} guessed today`}
          </li>
        </ol>
      ) : (
        <p className="mt-3 text-sm text-stone-400">
          No one&apos;s guessed yet today — play and you&apos;ll top the board.
        </p>
      )}

      {!me && <JoinForm />}
    </section>
  );
}

// Claim a spot on the board with a display name. Returning players (saved name)
// are added automatically; everyone else gets the input. On success we fire the
// shared refresh event so the board above re-fetches and shows the new row.
function JoinForm() {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const autoTried = useRef(false);

  const join = async (nameArg?: string) => {
    const n = (nameArg ?? name).trim();
    if (!n || joining) return;
    setJoining(true);
    localStorage.setItem("dillow:name", n);
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: getId(), name: n }),
      });
      const data = await res.json();
      if (res.ok && typeof data.rank === "number") {
        window.dispatchEvent(new Event("dillow:leaderboard-changed"));
      }
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    (async () => {
      const saved = localStorage.getItem("dillow:name") ?? "";
      setName(saved);
      if (saved && !autoTried.current) {
        autoTried.current = true;
        await join(saved);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-4 border-t border-stone-100 pt-4">
      <p className="text-sm font-medium text-stone-700">Add your name to the board</p>
      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="Your name"
          maxLength={24}
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => join()}
          disabled={joining}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {joining ? "…" : "Join"}
        </button>
      </div>
    </div>
  );
}

function LeaderRow({
  rank,
  entry,
  me,
}: {
  rank: number;
  entry: LeaderboardEntry | null;
  me: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${
        me ? "bg-emerald-50 font-semibold text-emerald-800" : ""
      }`}
    >
      <span className={me ? "" : "text-stone-700"}>
        <span className={`inline-block w-6 font-bold ${me ? "text-emerald-500" : "text-stone-400"}`}>
          {rankBadge(rank)}
        </span>
        {entry ? entry.name : "You"}
        {me && <span className="ml-1 text-xs font-medium text-emerald-600">(you)</span>}
      </span>
      {entry && (
        <span className={me ? "text-emerald-700" : "text-stone-500"}>
          {formatPct(entry.pctError)}% off · {entry.attempts}/{MAX_ATTEMPTS}
        </span>
      )}
    </li>
  );
}
