"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { FLAGS, getFlags, setFlag, type FlagKey } from "../_lib/flags";
import { loadRooms, type SavedRoom } from "../_lib/client-storage";

// Subscribe the whole page to flag changes so every toggle reflects instantly.
function useFlagMap() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("dillow:flags-changed", cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener("dillow:flags-changed", cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => JSON.stringify(getFlags()),
    () => "{}",
  );
}

export default function FlagsPage() {
  const serialized = useFlagMap();
  const flags = JSON.parse(serialized) as Partial<Record<FlagKey, boolean>>;
  const rooms: SavedRoom[] = typeof window === "undefined" ? [] : loadRooms();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight text-stone-800">Feature flags</h1>
        <Link href="/" className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
          ← Back to game
        </Link>
      </div>
      <p className="text-sm text-stone-500">
        Experimental features, toggled locally in your browser. Nothing here is saved to a server.
      </p>

      <ul className="flex flex-col gap-3">
        {FLAGS.map((f) => {
          const on = flags[f.key] === true;
          return (
            <li
              key={f.key}
              className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-stone-800">{f.title}</p>
                <p className="mt-1 text-sm text-stone-500">{f.description}</p>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`Toggle ${f.title}`}
                onClick={() => setFlag(f.key, !on)}
                className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${
                  on ? "bg-emerald-600" : "bg-stone-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    on ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {rooms.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Your rooms</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {rooms.map((r) => (
              <li key={r.roomId} className="flex items-center justify-between text-sm">
                <Link href={`/r/${r.roomId}`} className="font-semibold text-emerald-700 hover:underline">
                  /r/{r.roomId}
                </Link>
                <span className="text-stone-400">{r.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
