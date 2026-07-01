"use client";

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { getId } from "../_lib/client-storage";

// The four report reasons the API accepts, kept in lockstep with /api/report.
const REASONS = [
  "Wrong or missing info",
  "Misleading photos",
  "Not a real listing",
  "Other",
] as const;
type Reason = (typeof REASONS)[number];

// A quiet "report a problem" affordance for a home, plus the small modal it opens.
// The modal sits above the details modal (z-[70]) since it's launched from inside it.
export function ReportProperty({ propertyId, className = "" }: { propertyId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`flex ${className}`}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-stone-400 transition hover:text-stone-600"
      >
        <Flag className="h-3 w-3" />
        Report a problem with this home
      </button>
      {open && <ReportModal propertyId={propertyId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ReportModal({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState<Reason>(REASONS[0]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 320); // let the exit animation finish before unmounting
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (sending) return;
    setSending(true);
    setError(false);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, reason, note: note.trim(), id: getId() }),
      });
      if (!res.ok) throw new Error("failed");
      setSent(true);
      setTimeout(dismiss, 1200); // brief "thanks" then auto-close
    } catch {
      setError(true);
      setSending(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center ${
        closing ? "animate-modalfadeout" : "animate-modalfade"
      }`}
      onClick={dismiss}
    >
      <div
        className={`relative max-h-[85dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 shadow-xl ${
          closing ? "animate-modalpopout" : "animate-modalpop"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Report this home"
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 text-xl text-stone-400 transition hover:text-stone-700"
        >
          ✕
        </button>

        {sent ? (
          <p className="py-4 text-center text-sm text-stone-600">Thanks — we&apos;ll take a look 🙏</p>
        ) : (
          <>
            <h2 className="text-xl font-black text-emerald-900">Report this home</h2>
            <p className="mt-1 text-sm text-stone-500">What&apos;s wrong with this listing?</p>

            <div className="mt-4 flex flex-col gap-2">
              {REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm ring-1 transition ${
                    reason === r ? "bg-emerald-50 text-emerald-900 ring-emerald-300" : "text-stone-700 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    className="accent-emerald-600"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {r}
                </label>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Add a note (optional)"
              className="mt-3 w-full resize-none rounded-lg px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-emerald-300"
            />

            {error && <p className="mt-2 text-xs text-red-500">Couldn&apos;t send — try again.</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={dismiss}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-stone-500 ring-1 ring-stone-200 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={sending}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
