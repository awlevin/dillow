"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Trophy } from "lucide-react";
import { loadRooms, type SavedRoom } from "../_lib/client-storage";

// A deliberately quiet re-entry to the challenge rooms you've recently played,
// tucked at the foot of the main page. Hidden entirely until you've actually been
// in a room, and collapsed by default — tap to reveal the list (progressive
// disclosure) so it never competes with the day's game.
export function RecentRoomsMenu() {
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [open, setOpen] = useState(false);
  // roomId -> how many members have played today; fills in as fetches land.
  const [played, setPlayed] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      setRooms(loadRooms());
    })();
  }, []);

  const shown = rooms.slice(0, 6);

  // Fetch the "N played today" counts only once the menu is opened (they're not
  // needed while collapsed). Best-effort and in parallel — a failed or slow
  // fetch just leaves that row without a count; the list never blocks or reflows.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    for (const r of shown) {
      if (r.roomId in played) continue;
      fetch(`/api/room/${r.roomId}?summary=1`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data || typeof data.playedCount !== "number") return;
          setPlayed((p) => ({ ...p, [r.roomId]: data.playedCount }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rooms]);

  if (rooms.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-stone-400 transition hover:text-stone-600"
      >
        <Trophy size={13} className="text-amber-400" aria-hidden="true" />
        Friends
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="animate-reveal mt-1 flex w-full max-w-xs flex-col gap-0.5">
          {shown.map((r) => (
            <li key={r.roomId}>
              <Link
                href={`/r/${r.roomId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm text-stone-600 transition hover:bg-amber-50"
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-medium">{r.title ?? `Room ${r.roomId}`}</span>
                  {played[r.roomId] != null && (
                    <span className="shrink-0 text-xs text-stone-400">
                      · {played[r.roomId]} played
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-stone-400">{r.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
