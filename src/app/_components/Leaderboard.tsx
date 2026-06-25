"use client";

import { useEffect, useState } from "react";
import { getId } from "../_lib/client-storage";
import { MAX_ATTEMPTS } from "../_lib/format";
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
    </section>
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
          {Math.round(Math.abs(entry.pctError) * 100)}% off · {entry.attempts}/{MAX_ATTEMPTS}
        </span>
      )}
    </li>
  );
}
