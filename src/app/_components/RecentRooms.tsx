"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { useFlag } from "../_lib/flags";
import { loadRooms, type SavedRoom } from "../_lib/client-storage";

// Post-game list of challenge rooms the player recently created or joined, so
// they can hop back in. Gated by its own "recentRooms" flag.
export function RecentRooms() {
  const enabled = useFlag("recentRooms");
  const [rooms, setRooms] = useState<SavedRoom[]>([]);

  useEffect(() => {
    (async () => {
      setRooms(loadRooms());
    })();
  }, []);

  if (!enabled || rooms.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Recent rooms</h2>
      <ul className="mt-3 flex flex-col gap-1.5">
        {rooms.slice(0, 8).map((r) => (
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
              </span>
              <span className="shrink-0 font-mono text-xs text-stone-400">{r.date}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
