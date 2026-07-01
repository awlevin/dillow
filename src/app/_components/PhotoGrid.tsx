"use client";

import Image from "next/image";
import { useEffect } from "react";
import { X } from "lucide-react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";

type PhotoGridProps = {
  photos: string[];
  onSelect: (index: number) => void;
  onClose: () => void;
};

// Full-screen contact-sheet so players can jump straight to a photo instead of
// swiping through dozens. Photos only — the map lives on its own carousel slide.
export function PhotoGrid({ photos, onSelect, onClose }: PhotoGridProps) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="animate-modalfade fixed inset-0 z-[60] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold tabular-nums text-white/80">{photos.length} photos</span>
        <button
          onClick={onClose}
          aria-label="Close gallery"
          className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
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
