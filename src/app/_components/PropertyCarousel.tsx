"use client";

import Image from "next/image";
import type { RefObject } from "react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";
import type { Clue } from "../_lib/types";
import { PropertyMap } from "./PropertyMap";

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

  return (
    <div className="relative bg-stone-100">
      <div
        ref={carouselRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const lead = loop ? 1 : 0;
          const realSlides = slideCount;
          const i = Math.round(el.scrollLeft / el.clientWidth) - lead;
          if (i >= 0 && i < realSlides && i !== photoIdx) setPhotoIdx(i);
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
          <PhotoSlide key={src} src={src} alt={`Photo ${i + 1}`} />
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
                onClick={() => setMapActive(false)}
                className="absolute right-2 top-2 z-10 rounded-full bg-stone-900/70 px-3 py-1 text-xs font-semibold text-white shadow transition hover:bg-stone-900/85"
              >
                ✕ Done
              </button>
            )}
          </div>
        )}

        {loop && <PhotoSlide src={clue.photos[0]} alt="" keyName="loop-clone" hidden />}
      </div>

      {slideCount > 1 && (
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
      )}
    </div>
  );
}

function PhotoSlide({
  src,
  alt,
  keyName,
  hidden,
}: {
  src: string;
  alt: string;
  keyName?: string;
  hidden?: boolean;
}) {
  return (
    <div key={keyName} aria-hidden={hidden} className="relative h-full w-full shrink-0 snap-center">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, 576px"
        loader={rdcpixLoader}
        placeholder="blur"
        blurDataURL={rdcpixThumb(src)}
        className="object-cover"
      />
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
