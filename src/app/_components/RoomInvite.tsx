"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { getId, recordRoom } from "../_lib/client-storage";

// Shown after the daily game ends: one tap creates a private room of 3 bonus
// rounds, shares the link, and drops the creator into it. No name is asked for
// up front — the room borrows the player's saved name (and can be renamed from
// the room page), keeping the path to sharing free of friction.
export function RoomInvite() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const name = (localStorage.getItem("dillow:name") ?? "").trim();
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: getId(), name }),
      });
      const data = await res.json();
      if (!res.ok || !data.roomId) throw new Error(data.error ?? "failed");

      const roomId = data.roomId as string;
      const title = name ? `${name}’s room` : "my Dillow room";
      recordRoom(roomId, new Date().toISOString().slice(0, 10), name ? `${name}’s room` : undefined);
      const url = `${window.location.origin}/r/${roomId}`;
      const message = `Join ${title} on Dillow — a lightning round, head to head.`;

      // Share the invite (native sheet → clipboard fallback), then enter the room.
      // The native sheet renders the link from its own `url` field, so keep it OUT
      // of the body text — putting it in both makes a second link preview. The
      // clipboard fallback has no `url` field, so it appends the link itself.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ text: message, url });
        } catch (e) {
          if ((e as { name?: string }).name !== "AbortError") {
            navigator.clipboard?.writeText(`${message}\n${url}`);
          }
        }
      } else {
        navigator.clipboard?.writeText(`${message}\n${url}`);
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
          Play a lightning round against a friend or a group, with a live leaderboard.
        </p>
        <button
          onClick={start}
          disabled={busy}
          className="mt-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start a lightning round"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
