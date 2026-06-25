"use client";

import { useEffect, useState } from "react";
import { rdcpixResize } from "@/lib/rdcpix";
import { MAX_ATTEMPTS, usd } from "../_lib/format";
import type { LeaderboardBoard } from "../_lib/types";

export function Yesterday({ streak }: { streak: number }) {
  const [board, setBoard] = useState<LeaderboardBoard | null>(null);

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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          Yesterday&apos;s results{date ? ` · ${date}` : ""}
        </h2>
        {streak > 0 && (
          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-sm font-bold text-orange-600">
            🔥 {streak}-day streak
          </span>
        )}
      </div>
      {property && (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rdcpixResize(property.photos[0], 160)} alt="" className="h-14 w-20 rounded-lg object-cover" />
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
                {Math.round(Math.abs(e.pctError) * 100)}% off · {e.attempts}/{MAX_ATTEMPTS}
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
