"use client";

import Image from "next/image";
import { useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";
import type { Clue } from "../_lib/types";
import { MapModal } from "./MapModal";
import { PhotoLightbox } from "./PhotoLightbox";
import { PropertyMap } from "./PropertyMap";

// Above this many photos, the per-slide dots give way to a compact counter.
const MAX_DOTS = 8;

type PropertyCarouselProps = {
  clue: Clue;
  done: boolean;
  hasMap: boolean;
  loop: boolean;
  mapActive: boolean;
  photoIdx: number;
  carouselRef: RefObject<HTMLDivElement | null>;
  loopResetRef: RefObject<ReturnType<typeof setTimeout> | null>;
  setPhotoIdx: (index: number) => void;
  setMapActive: (active: boolean) => void;
};

export function PropertyCarousel({
  clue,
  done,
  hasMap,
  loop,
  mapActive,
  photoIdx,
  carouselRef,
  loopResetRef,
  setPhotoIdx,
  setMapActive,
}: PropertyCarouselProps) {
  const slideCount = clue.photos.length + (hasMap ? 1 : 0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [fullMap, setFullMap] = useState(false);

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
          const realSlides = slideCount;
          const i = Math.round(el.scrollLeft / el.clientWidth) - lead;
          if (i >= 0 && i < realSlides && i !== photoIdx) setPhotoIdx(i);
          // Leaving the map slide implicitly "closes" it (no Done button) — the
          // arrows/dots are the way out, and the overlay returns on the way back.
          if (hasMap && mapActive && i !== clue.photos.length) setMapActive(false);
          if (loopResetRef.current) clearTimeout(loopResetRef.current);
          if (realSlides > 1) {
            if (i >= realSlides) {
              loopResetRef.current = setTimeout(() => {
                el.scrollLeft = lead * el.clientWidth;
                setPhotoIdx(0);
              }, 140);
            } else if (i < 0) {
              loopResetRef.current = setTimeout(() => {
                el.scrollLeft = realSlides * el.clientWidth;
                setPhotoIdx(realSlides - 1);
              }, 140);
            }
          }
        }}
        className="no-scrollbar flex aspect-[16/10] touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain sm:aspect-[3/2]"
      >
        {loop && (
          hasMap ? (
            <MapSlide clue={clue} keyName="lead-clone" hidden />
          ) : (
            <PhotoSlide src={clue.photos[clue.photos.length - 1]} alt="" keyName="lead-clone" hidden />
          )
        )}

        {clue.photos.map((src, i) => (
          <PhotoSlide key={src} src={src} alt={`Photo ${i + 1}`} onOpen={() => setLightboxIdx(i)} />
        ))}

        {hasMap && (
          <div key="map" className="relative h-full w-full shrink-0 snap-center bg-stone-100">
            <div className={mapActive ? "h-full w-full" : "pointer-events-none h-full w-full"}>
              <PropertyMap lat={clue.lat!} lon={clue.lon!} fill />
            </div>
            {!mapActive ? (
              <button
                onClick={() => setMapActive(true)}
                aria-label="Explore the property location on a map"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-stone-900/35 text-white transition hover:bg-stone-900/45"
              >
                <span className="text-4xl drop-shadow">📍</span>
                <span className="rounded-full bg-white/95 px-4 py-1.5 text-sm font-semibold text-stone-800 shadow">
                  Tap to explore the map
                </span>
                {!done && (
                  <span className="px-6 text-center text-xs text-white/90 drop-shadow">
                    Location is a clue — the price is still up to you
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={() => setFullMap(true)}
                aria-label="Expand map to full screen"
                className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/70 text-white shadow transition hover:bg-stone-900/85"
              >
                <Maximize2 size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {loop && <PhotoSlide src={clue.photos[0]} alt="" keyName="loop-clone" hidden />}
      </div>

      {/* A dot per slide reads well for a handful of photos, but a rich gallery
          would cram dozens of dots across the frame — past a threshold, switch to
          a compact "n / total" counter (with a 📍 when the map slide is in view). */}
      {slideCount > 1 &&
        (clue.photos.length > MAX_DOTS ? (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-stone-900/55 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white">
            {hasMap && photoIdx === clue.photos.length ? "📍 Map" : `${photoIdx + 1} / ${clue.photos.length}`}
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: slideCount }).map((_, i) => {
              const isMapDot = hasMap && i === clue.photos.length;
              return (
                <button
                  key={i}
                  onClick={() =>
                    carouselRef.current?.scrollTo({
                      left: (i + (loop ? 1 : 0)) * carouselRef.current.clientWidth,
                      behavior: "smooth",
                    })
                  }
                  aria-label={isMapDot ? "Map" : `Photo ${i + 1}`}
                  className={`pointer-events-auto rounded-full transition ${
                    i === photoIdx ? "bg-white" : "bg-white/50"
                  } ${isMapDot ? "grid h-2.5 w-2.5 place-items-center text-[7px] leading-none" : "h-2 w-2"}`}
                >
                  {isMapDot ? "📍" : ""}
                </button>
              );
            })}
          </div>
        ))}

      {slideCount > 1 && (
        <>
          <button
            onClick={() => nudge(-1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 scale-90 rounded-full bg-transparent p-1.5 text-white transition-all duration-200 group-hover:scale-100 group-hover:bg-stone-900/30 hover:scale-110 hover:bg-stone-900/60 sm:block"
          >
            <ChevronLeft size={18} aria-hidden="true" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" />
          </button>
          <button
            onClick={() => nudge(1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 scale-90 rounded-full bg-transparent p-1.5 text-white transition-all duration-200 group-hover:scale-100 group-hover:bg-stone-900/30 hover:scale-110 hover:bg-stone-900/60 sm:block"
          >
            <ChevronRight size={18} aria-hidden="true" className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" />
          </button>
        </>
      )}

      {lightboxIdx !== null && (
        <PhotoLightbox photos={clue.photos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}

      {fullMap && hasMap && (
        <MapModal lat={clue.lat!} lon={clue.lon!} onClose={() => setFullMap(false)} />
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

function MapSlide({
  clue,
  keyName,
  hidden,
}: {
  clue: Clue;
  keyName: string;
  hidden?: boolean;
}) {
  return (
    <div key={keyName} aria-hidden={hidden} className="relative h-full w-full shrink-0 snap-center bg-stone-100">
      <div className="pointer-events-none h-full w-full">
        <PropertyMap lat={clue.lat!} lon={clue.lon!} fill />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-stone-900/35 text-white">
        <span className="text-4xl drop-shadow">📍</span>
        <span className="rounded-full bg-white/95 px-4 py-1.5 text-sm font-semibold text-stone-800 shadow">
          Tap to explore the map
        </span>
      </div>
    </div>
  );
}
