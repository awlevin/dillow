"use client";

import { useEffect, useRef, useState } from "react";
import { getId } from "../_lib/client-storage";
import { formatPct, MAX_ATTEMPTS } from "../_lib/format";
import type { LeaderboardEntry, PropertyBoard } from "../_lib/types";

const rankBadge = (rank: number) =>
  rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;

// All-time leaderboard for a single home: everyone who has ever guessed it,
// ranked by their closest guess. Mounted under a home's reveal, so by the time
// it loads the player has finished this home and the board is unlocked.
export function PropertyLeaderboard({ propertyId }: { propertyId: string }) {
  const [board, setBoard] = useState<PropertyBoard | null>(null);

  const fetchBoard = async (): Promise<PropertyBoard> => {
    const id = getId();
    const res = await fetch(
      `/api/leaderboard?propertyId=${encodeURIComponent(propertyId)}&id=${encodeURIComponent(id)}`,
    );
    return res.json();
  };

  // Join this home's board with the given name (best-effort; safe to repeat).
  const join = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: getId(), name: n, propertyId }),
    }).catch(() => {});
  };

  // Fetch the board, and — for a returning player (saved name) — auto-join the
  // first time they see it so their row shows without a manual "Join".
  const fetchWithAutoJoin = async (): Promise<PropertyBoard> => {
    let b = await fetchBoard();
    const saved = localStorage.getItem("dillow:name")?.trim();
    if (b.enabled && !b.locked && !b.me && saved) {
      await join(saved);
      b = await fetchBoard();
    }
    return b;
  };

  useEffect(() => {
    const load = () => fetchWithAutoJoin().then(setBoard).catch(() => setBoard({ enabled: false }));
    load();
    // Adding a name on any one home's board joins them all.
    const onNameSet = () => load();
    window.addEventListener("dillow:name-set", onNameSet);
    return () => window.removeEventListener("dillow:name-set", onNameSet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  if (!board?.enabled) return null;
  const { top = [], count = 0, me } = board;

  const myId = me?.entry?.id ?? null;
  const meInTop = myId ? top.some((e) => e.id === myId) : false;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
        Leaderboard
      </h2>

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
              ? `You placed #${me.rank} of ${count} ${count === 1 ? "guess" : "guesses"} on this home`
              : `${count} ${count === 1 ? "person has" : "people have"} guessed this home`}
          </li>
        </ol>
      ) : (
        <p className="mt-3 text-sm text-stone-400">
          No one&apos;s guessed this home yet — you&apos;re the first to top the board.
        </p>
      )}

      {!me && <JoinForm onJoin={join} />}
    </section>
  );
}

// Claim a spot with a display name. Saving it fires a shared event so every home's
// board the player has finished today joins at once.
function JoinForm({ onJoin }: { onJoin: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const autoTried = useRef(false);

  const submit = async (nameArg?: string) => {
    const n = (nameArg ?? name).trim();
    if (!n || joining) return;
    setJoining(true);
    localStorage.setItem("dillow:name", n);
    try {
      await onJoin(n);
      window.dispatchEvent(new Event("dillow:name-set"));
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
        await submit(saved);
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
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Your name"
          maxLength={24}
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => submit()}
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
