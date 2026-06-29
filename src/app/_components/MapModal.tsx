"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PropertyMap } from "./PropertyMap";

// Full-screen map overlay — built with mobile in mind, where the inline carousel
// map is too small to actually pan around. Edge-to-edge map, scroll locked behind
// it, close via the ✕ (notch-safe) or Escape.
export function MapModal({ lat, lon, onClose }: { lat: number; lon: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // don't let the page scroll under the map
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="animate-modalfade fixed inset-0 z-[60] bg-stone-900">
      <div className="absolute inset-0">
        <PropertyMap lat={lat} lon={lon} fill />
      </div>
      <button
        onClick={onClose}
        aria-label="Close map"
        className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-stone-900/70 text-white shadow-lg backdrop-blur transition hover:bg-stone-900/90"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
