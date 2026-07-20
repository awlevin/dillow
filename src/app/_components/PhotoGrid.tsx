"use client";

import Image from "next/image";
import { useEffect, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";

type PhotoGridProps = {
  photos: string[];
  onSelect: (index: number) => void;
  onClose: () => void;
};

// Full-screen contact-sheet so players can jump straight to a photo instead of
// swiping through dozens. Photos only — the map opens from its own toggle.
// Closes like it opens (mirrored fade, see Modal), via ✕, Escape, or a click on
// any empty backdrop area — but not the gaps between tiles, where a stray tap
// is more likely a near-miss on a photo.
export function PhotoGrid({ photos, onSelect, onClose }: PhotoGridProps) {
  const [closing, setClosing] = useState(false);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 320); // let the exit animation finish before unmounting
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close only when the click lands on the element itself — anything inside
  // (photos, the ✕) handles its own click and shouldn't double as a dismiss.
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === e.currentTarget) dismiss();
  };

  return (
    <div
      onClick={onBackdrop}
      className={`fixed inset-0 z-[60] flex flex-col bg-black/95 ${
        closing ? "animate-modalfadeout" : "animate-modalfade"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
    >
      <div onClick={onBackdrop} className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold tabular-nums text-white/80">{photos.length} photos</span>
        <button
          onClick={dismiss}
          aria-label="Close gallery"
          className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div onClick={onBackdrop} className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-1.5">
          {photos.map((src, i) => (
            <button
              key={src}
              onClick={() => onSelect(i)}
              aria-label={`View photo ${i + 1}`}
              className="relative aspect-square overflow-hidden rounded-lg bg-stone-800 transition hover:opacity-90"
            >
              <Image
                src={src}
                alt={`Photo ${i + 1}`}
                fill
                sizes="(max-width: 640px) 33vw, 180px"
                loader={rdcpixLoader}
                placeholder="blur"
                blurDataURL={rdcpixThumb(src)}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
