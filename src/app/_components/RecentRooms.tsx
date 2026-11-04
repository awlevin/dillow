"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { useFlag } from "../_lib/flags";
import { forgetRoom, loadRooms, type SavedRoom } from "../_lib/client-storage";

// Post-game list of challenge rooms the player recently created or joined, so
// they can hop back in. Gated by its own "recentRooms" flag.
export function RecentRooms() {
  const enabled = useFlag("recentRooms");
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  // roomId -> how many members have played today; fills in as fetches land.
  const [played, setPlayed] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      setRooms(loadRooms());
    })();
  }, []);

  const shown = rooms.slice(0, 8);

  // Fetch the "N played today" counts on mount, best-effort and in parallel — a
  // failed or slow fetch just leaves that row without a count; the list never
  // blocks or reflows while they load.
  useEffect(() => {
    if (!enabled) return; // flag off → the list never renders, so don't spend the fetches
    let cancelled = false;
    for (const r of shown) {
      fetch(`/api/room/${r.roomId}?summary=1`)
        .then((res) => {
          if (res.status === 404) {
            // The room expired — stop listing it.
            forgetRoom(r.roomId);
            setRooms((rs) => rs.filter((x) => x.roomId !== r.roomId));
            return null;
          }
          return res.ok ? res.json() : null;
        })
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
  }, [rooms, enabled]);

  if (!enabled || rooms.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Friends</h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {shown.map((r) => (
          <li key={r.roomId}>
            <Link
              href={`/r/${r.roomId}`}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-amber-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Trophy size={15} className="shrink-0 text-amber-500" aria-hidden="true" />
                <span className="truncate font-semibold text-stone-700">
                  {r.title ?? `Room ${r.roomId}`}
                </span>
                {played[r.roomId] != null && (
                  <span className="shrink-0 text-xs text-stone-400">· {played[r.roomId]} played</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs text-stone-400">{r.date}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
