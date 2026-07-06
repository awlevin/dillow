"use client";

import { useEffect, useState, type ReactNode } from "react";

const MAX_W = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" } as const;

type ModalProps = {
  onClose: () => void;
  // Rendered inside the panel; receives an animated `dismiss` so buttons like
  // "Cancel" or "Got it" close with the same exit animation as the backdrop/✕.
  children: (dismiss: () => void) => ReactNode;
  label: string; // aria-label for the dialog
  maxWidth?: keyof typeof MAX_W;
  // Raised for modals launched from inside another modal (e.g. the report dialog).
  zClassName?: string;
};

// The shared card-dialog shell. The panel is centered in the viewport and capped
// to the screen height (never offscreen), scrolling inside when its content is
// taller. Dismisses on backdrop click or Escape and plays the same pop/fade in
// and out — so every modal opens, closes, and sits on screen identically.
export function Modal({ onClose, children, label, maxWidth = "md", zClassName = "z-50" }: ModalProps) {
  const [closing, setClosing] = useState(false);
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

  return (
    <div
      className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/40 p-4 ${
        closing ? "animate-modalfadeout" : "animate-modalfade"
      }`}
      onClick={dismiss}
    >
      <div
        className={`relative max-h-[calc(100dvh-2rem)] w-full ${MAX_W[maxWidth]} overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 shadow-xl ${
          closing ? "animate-modalpopout" : "animate-modalpop"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 text-xl text-stone-400 transition hover:text-stone-700"
        >
          ✕
        </button>
        {children(dismiss)}
      </div>
    </div>
  );
}
