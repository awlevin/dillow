"use client";

import { useEffect, useState } from "react";
import { useCountUp } from "../_hooks/useCountUp";
import { getId } from "../_lib/client-storage";
import { usd } from "../_lib/format";
import type { Reveal, Row } from "../_lib/types";

export function RevealCard({
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
  const animatedPrice = useCountUp(property.price);

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
        // Nudge the live leaderboard to refetch so the player's new placement shows.
        window.dispatchEvent(new Event("dillow:leaderboard-changed"));
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
          <p className="animate-pricepop text-2xl font-black tabular-nums text-emerald-700">
            {usd(animatedPrice)}
          </p>
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
            🏆 You&apos;re <span className="font-bold">#{joinRank.rank}</span> of {joinRank.count} today · see
            the full board below
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-white/70 p-3 text-left">
            <p className="text-sm font-medium text-stone-700">Add your name to today&apos;s leaderboard</p>
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
              if ((e as { name?: string }).name === "AbortError") return;
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
    </div>
  );
}
