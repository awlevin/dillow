"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";

type PhotoLightboxProps = {
  photos: string[];
  startIndex: number;
  onClose: () => void;
};

export function PhotoLightbox({ photos, startIndex, onClose }: PhotoLightboxProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(startIndex);

  // Jump to the tapped photo on mount, then lock body scroll while open.
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = startIndex * el.clientWidth;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [startIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="animate-reveal fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold tabular-nums text-white/80">
          {idx + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          aria-label="Close photo viewer"
          className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== idx && i >= 0 && i < photos.length) setIdx(i);
        }}
        className="no-scrollbar flex flex-1 touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain"
      >
        {photos.map((src, i) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-center">
            <Image
              src={src}
              alt={`Photo ${i + 1}`}
              fill
              sizes="100vw"
              loader={rdcpixLoader}
              placeholder="blur"
              blurDataURL={rdcpixThumb(src)}
              className="object-contain"
            />
          </div>
        ))}
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 py-4">
          {photos.map((src, i) => (
            <button
              key={src}
              onClick={() =>
                trackRef.current?.scrollTo({
                  left: i * trackRef.current.clientWidth,
                  behavior: "smooth",
                })
              }
              aria-label={`Photo ${i + 1}`}
              className={`h-2 w-2 rounded-full transition ${i === idx ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
