"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";
import type { Clue } from "../_lib/types";
import { PhotoGrid } from "./PhotoGrid";
import { PhotoLightbox } from "./PhotoLightbox";

// Above this many photos, the per-slide dots give way to a compact counter.
const MAX_DOTS = 8;

type PropertyCarouselProps = {
  clue: Clue;
  loop: boolean;
  photoIdx: number;
  carouselRef: RefObject<HTMLDivElement | null>;
  loopResetRef: RefObject<ReturnType<typeof setTimeout> | null>;
  setPhotoIdx: (index: number) => void;
};

// The photo strip. Photos only — the map is a separate overlay toggled from the
// facts row (see PropertyCard), so it can't be swiped into by accident.
export function PropertyCarousel({
  clue,
  loop,
  photoIdx,
  carouselRef,
  loopResetRef,
  setPhotoIdx,
}: PropertyCarouselProps) {
  const slideCount = clue.photos.length;
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [gridOpen, setGridOpen] = useState(false);

  // The "n / total" counter clutters the photo on touch, so on small screens it's
  // transient: reveal on each slide change, then fade ~1.2s after the last one. On
  // sm+ it stays put (CSS `sm:opacity-100`); this state only governs mobile.
  const [counterVisible, setCounterVisible] = useState(false);
  const counterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealCounter = () => {
    setCounterVisible(true);
    if (counterTimer.current) clearTimeout(counterTimer.current);
    counterTimer.current = setTimeout(() => setCounterVisible(false), 1200);
  };
  useEffect(
    () => () => {
      if (counterTimer.current) clearTimeout(counterTimer.current);
    },
    [],
  );

  // Picking a photo from the gallery opens it full-screen (the lightbox), rather
  // than quietly scrolling the small inline carousel behind the closing grid.
  const openFromGrid = (i: number) => {
    setGridOpen(false);
    setLightboxIdx(i);
  };

  // Desktop-only prev/next: nudge the scroll container by one slide; the
  // onScroll handler above keeps photoIdx and the loop wrap in sync.
  const nudge = (dir: -1 | 1) => {
    const el = carouselRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="group relative bg-stone-100">
      <div
        ref={carouselRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const lead = loop ? 1 : 0;
          const i = Math.round(el.scrollLeft / el.clientWidth) - lead;
          if (i >= 0 && i < slideCount && i !== photoIdx) {
            setPhotoIdx(i);
            revealCounter();
          }
          if (loopResetRef.current) clearTimeout(loopResetRef.current);
          if (slideCount > 1) {
            if (i >= slideCount) {
              loopResetRef.current = setTimeout(() => {
                el.scrollLeft = lead * el.clientWidth;
                setPhotoIdx(0);
              }, 140);
            } else if (i < 0) {
              loopResetRef.current = setTimeout(() => {
                el.scrollLeft = slideCount * el.clientWidth;
                setPhotoIdx(slideCount - 1);
              }, 140);
            }
          }
        }}
        className="no-scrollbar flex aspect-[16/10] touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain sm:aspect-[3/2]"
      >
        {loop && (
          <PhotoSlide src={clue.photos[clue.photos.length - 1]} alt="" keyName="lead-clone" hidden />
        )}

        {clue.photos.map((src, i) => (
          <PhotoSlide key={src} src={src} alt={`Photo ${i + 1}`} onOpen={() => setLightboxIdx(i)} />
        ))}

        {loop && <PhotoSlide src={clue.photos[0]} alt="" keyName="loop-clone" hidden />}
      </div>

      {/* A dot per slide reads well for a handful of photos, but a rich gallery
          would cram dozens of dots across the frame — past a threshold, switch to
          a compact "n / total" counter. */}
      {slideCount > 1 &&
        (slideCount > MAX_DOTS ? (
          <div
            className={`pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-stone-900/55 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white transition-opacity duration-500 sm:opacity-100 ${
              counterVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            {`${photoIdx + 1} / ${slideCount}`}
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: slideCount }).map((_, i) => (
              <button
                key={i}
                onClick={() =>
                  carouselRef.current?.scrollTo({
                    left: (i + (loop ? 1 : 0)) * carouselRef.current.clientWidth,
                    behavior: "smooth",
                  })
                }
                aria-label={`Photo ${i + 1}`}
                className={`pointer-events-auto h-2 w-2 rounded-full transition ${
                  i === photoIdx ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        ))}

      {/* Prev/next arrows. On touch they sit on a quiet scrim (there's no hover
          to reveal them); on sm+ they stay invisible until the frame is hovered. */}
      {slideCount > 1 && (
        <>
          <button
            onClick={() => nudge(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-stone-900/25 p-1.5 text-white transition-all duration-200 hover:scale-110 hover:bg-stone-900/60 sm:scale-90 sm:bg-transparent sm:group-hover:scale-100 sm:group-hover:bg-stone-900/30"
          >
            <ChevronLeft size={18} aria-hidden="true" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" />
          </button>
          <button
            onClick={() => nudge(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-stone-900/25 p-1.5 text-white transition-all duration-200 hover:scale-110 hover:bg-stone-900/60 sm:scale-90 sm:bg-transparent sm:group-hover:scale-100 sm:group-hover:bg-stone-900/30"
          >
            <ChevronRight size={18} aria-hidden="true" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" />
          </button>
        </>
      )}

      {clue.photos.length > 1 && (
        <button
          onClick={() => setGridOpen(true)}
          aria-label="View all photos in a gallery"
          className="absolute bottom-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/55 text-white shadow transition hover:bg-stone-900/75"
        >
          <LayoutGrid size={15} aria-hidden="true" />
        </button>
      )}

      {gridOpen && (
        <PhotoGrid photos={clue.photos} onSelect={openFromGrid} onClose={() => setGridOpen(false)} />
      )}

      {lightboxIdx !== null && (
        <PhotoLightbox photos={clue.photos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  );
}

function PhotoSlide({
  src,
  alt,
  keyName,
  hidden,
  onOpen,
}: {
  src: string;
  alt: string;
  keyName?: string;
  hidden?: boolean;
  onOpen?: () => void;
}) {
  // "Develop" the photo: it lands soft + desaturated, then sharpens into focus
  // and full colour once the full-res image finishes loading.
  const [loaded, setLoaded] = useState(false);
  return (
    <div key={keyName} aria-hidden={hidden} className="relative h-full w-full shrink-0 snap-center overflow-hidden">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, 576px"
        loader={rdcpixLoader}
        placeholder="blur"
        blurDataURL={rdcpixThumb(src)}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className={`object-cover transition-[transform,filter] duration-700 ease-out motion-reduce:transition-none ${
          loaded ? "scale-100 blur-0 saturate-100" : "scale-[1.04] blur-[6px] saturate-[0.65]"
        }`}
      />
      {onOpen && (
        <button
          onClick={onOpen}
          aria-label="View photo full screen"
          className="absolute inset-0 z-10 cursor-pointer"
        />
      )}
    </div>
  );
}
