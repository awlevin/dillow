"use client";

import { useState } from "react";

type Current = {
  city: string;
  state: string;
  price: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  photos: number;
  photo: string | null;
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [current, setCurrent] = useState<Current | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: "verify" | "rotate") {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAuthed(true);
      setCurrent(data.current);
      if (action === "rotate") {
        setMsg(`Rotated — now showing ${data.current.city}, ${data.current.state}.`);
      }
    } catch (e) {
      setError((e as Error).message);
      if (action === "verify") setAuthed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 py-12">
      <h1 className="text-center text-2xl font-black text-emerald-900">dillow admin</h1>

      {!authed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <label className="text-sm font-medium text-stone-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && call("verify")}
            placeholder="••••"
            className="rounded-lg border border-stone-300 px-3 py-2.5 outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => call("verify")}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "…" : "Enter"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">Property of the day</p>
            {current && (
              <div className="mt-2 flex items-center gap-3">
                {current.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.photo} alt="" className="h-16 w-24 rounded-lg object-cover" />
                )}
                <div>
                  <p className="font-semibold text-stone-800">
                    {current.city}, {current.state}
                  </p>
                  <p className="text-lg font-black text-emerald-700">{usd(current.price)}</p>
                  <p className="text-xs text-stone-400">
                    {current.beds ?? "—"} bd · {current.baths ?? "—"} ba ·{" "}
                    {current.sqft?.toLocaleString() ?? "—"} sqft · {current.photos} photos
                  </p>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => call("rotate")}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Rotating…" : "🔄 Rotate property of the day"}
          </button>
          <p className="text-xs text-stone-400">
            Rotating swaps today&apos;s home for everyone and resets today&apos;s leaderboard +
            in-progress games. Press again to keep cycling through the pool.
          </p>
          {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </main>
  );
}
