"use client";

import { useState } from "react";
import { BandVisualizer } from "./BandVisualizer";

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

  async function call(action: "verify" | "rotate" | "enrich") {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action }),
      });
      // Parse defensively: a timeout/crash can return an empty or non-JSON body,
      // which would otherwise throw "Unexpected end of JSON input" here.
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw new Error(
          data.error ?? `Request failed (${res.status}). The photo service may be slow — try again.`,
        );
      }
      setAuthed(true);
      setCurrent(data.current);
      if (action === "rotate") {
        setMsg(`Rotated — now showing ${data.current.city}, ${data.current.state}.`);
      } else if (action === "enrich") {
        setMsg(`${data.current.photos} photos now loaded for ${data.current.city}.`);
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
          <button
            onClick={() => call("enrich")}
            disabled={busy}
            className="rounded-lg border border-emerald-600 px-5 py-2.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? "…" : "🖼️ Load more photos for this property"}
          </button>
          <p className="text-xs text-stone-400">
            Rotating swaps today&apos;s standard home for everyone (and auto-loads its full photo
            gallery), resetting today&apos;s in-progress games. The all-time per-home leaderboards
            stay. &ldquo;Load more photos&rdquo; fetches the full gallery for the current home (and
            pre-warms the day&apos;s big-spender home) without rotating. Each costs one realtor16
            request.
          </p>
          {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {authed && <BandVisualizer />}
    </main>
  );
}
