"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { getId, recordRoom } from "../_lib/client-storage";

// Shown after the daily game ends (when the Challenge Rooms flag is on): create a
// private room of 3 bonus rounds, share the link, and drop into it. The people
// who open the link join the same room and compete on its own leaderboard. A
// name is required first — the room is titled after its creator ("Alex's room").
export function RoomInvite() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setName(localStorage.getItem("dillow:name") ?? "");
    })();
  }, []);

  const trimmed = name.trim();
  const title = trimmed ? `${trimmed}’s room` : "";

  async function start() {
    if (busy || !trimmed) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem("dillow:name", trimmed);
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: getId(), name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.roomId) throw new Error(data.error ?? "failed");

      const roomId = data.roomId as string;
      recordRoom(roomId, new Date().toISOString().slice(0, 10), title);
      const url = `${window.location.origin}/r/${roomId}`;

      // Share the invite (native sheet → clipboard fallback), then enter the room.
      const text = `Join ${title} on Dillow — 3 bonus rounds, head to head. Can you beat me?\n${url}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ text, url });
        } catch (e) {
          if ((e as { name?: string }).name !== "AbortError") navigator.clipboard?.writeText(text);
        }
      } else {
        navigator.clipboard?.writeText(text);
      }
      router.push(`/r/${roomId}`);
    } catch {
      setError("Couldn't start a room. Try again.");
      setBusy(false);
    }
  }

  return (
    <section className="animate-reveal overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-5 text-center shadow-sm">
      <div className="flex flex-col items-center gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Trophy size={22} aria-hidden="true" />
        </span>
        <h2 className="text-base font-extrabold tracking-tight text-stone-800">
          Challenge your friends
        </h2>
        <p className="max-w-sm text-sm text-stone-600">
          Share a link to unlock <span className="font-semibold">3 bonus rounds</span> today. Everyone
          you invite plays the same homes — go head to head on your own leaderboard.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="Your name"
          maxLength={24}
          aria-label="Your name"
          className="mt-1 w-full max-w-xs rounded-lg border border-stone-300 px-3 py-2 text-center text-sm outline-none focus:border-emerald-500"
        />
        <p className="h-4 text-xs text-stone-500">
          {trimmed ? (
            <>Shared as <span className="font-semibold text-stone-700">{title}</span></>
          ) : (
            "Enter your name to start a room"
          )}
        </p>
        <button
          onClick={start}
          disabled={busy || !trimmed}
          className="mt-1 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Starting…" : "Share & play 3 bonus rounds"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
