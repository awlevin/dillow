"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, X } from "lucide-react";
import { rdcpixLoader, rdcpixThumb } from "@/lib/rdcpix";
import { PhotoGrid } from "./PhotoGrid";

// Beyond this many photos a dot-per-photo row is unreadable, so we swap it for a
// thin progress bar (the header already carries the exact "idx / total").
const MAX_DOTS = 8;

type PhotoLightboxProps = {
  photos: string[];
  startIndex: number;
  onClose: () => void;
};

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

export function PhotoLightbox({ photos, startIndex, onClose }: PhotoLightboxProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [idx, setIdx] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);

  // Current index for the (mount-stable) gesture listeners, which can't close over
  // React state.
  const idxRef = useRef(startIndex);
  // Live transform of the active slide. Mutated imperatively during gestures for
  // smoothness; `zoomed` state only flips when we cross the 1x threshold (to gate
  // the scroll-snap track), so it doesn't re-render mid-pinch.
  const z = useRef({ s: 1, tx: 0, ty: 0 });
  const g = useRef({
    mode: "none" as "none" | "pan" | "pinch",
    startDist: 0,
    startScale: 1,
    startMid: { x: 0, y: 0 },
    startT: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    downPos: { x: 0, y: 0 },
    downTime: 0,
    moved: false,
    lastTap: 0,
    lastTapPos: { x: 0, y: 0 },
    lastTouchEnd: 0,
  });

  const apply = useCallback(() => {
    const el = slideRefs.current[idxRef.current];
    if (!el) return;
    const { s, tx, ty } = z.current;
    el.style.transform = s === 1 ? "" : `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
  }, []);

  // Keep the scaled image covering the frame so it can never be flung off-screen.
  const clamp = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const s = Math.min(MAX_SCALE, Math.max(1, z.current.s));
    z.current.s = s;
    z.current.tx = Math.min(0, Math.max((1 - s) * W, z.current.tx));
    z.current.ty = Math.min(0, Math.max((1 - s) * H, z.current.ty));
  }, []);

  const resetZoom = useCallback(() => {
    z.current = { s: 1, tx: 0, ty: 0 };
    slideRefs.current.forEach((el) => {
      if (el) el.style.transform = "";
    });
    setZoomed(false);
  }, []);

  // Scale to `s1` while pinning the focal point (fx, fy — relative to the frame).
  const zoomAround = useCallback(
    (s1: number, fx: number, fy: number) => {
      const s0 = z.current.s;
      z.current.tx = fx - (s1 / s0) * (fx - z.current.tx);
      z.current.ty = fy - (s1 / s0) * (fy - z.current.ty);
      z.current.s = s1;
      clamp();
      apply();
      setZoomed(s1 > 1);
    },
    [apply, clamp],
  );

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

  // Zoom is per-photo: navigating to a new slide resets it (see the scroll/grid
  // handlers, which own the idx change).
  const goTo = useCallback(
    (i: number) => {
      idxRef.current = i;
      setIdx(i);
      resetZoom();
    },
    [resetZoom],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Touch/pointer gestures. Attached natively (passive:false) so we can
  // preventDefault to stop native scroll/pinch while manipulating a zoomed photo.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const rectPoint = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches;
      if (t.length === 2) {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        const mid = rectPoint((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
        g.current.mode = "pinch";
        g.current.startDist = Math.hypot(dx, dy) || 1;
        g.current.startScale = z.current.s;
        g.current.startMid = mid;
        g.current.startT = { x: z.current.tx, y: z.current.ty };
        g.current.moved = true;
        e.preventDefault();
      } else if (t.length === 1) {
        g.current.downPos = { x: t[0].clientX, y: t[0].clientY };
        g.current.downTime = Date.now();
        g.current.moved = false;
        if (z.current.s > 1) {
          // Panning a zoomed photo — take over from the track's native scroll.
          g.current.mode = "pan";
          g.current.startT = { x: z.current.tx, y: z.current.ty };
          g.current.panStart = { x: t[0].clientX, y: t[0].clientY };
          e.preventDefault();
        } else {
          g.current.mode = "none"; // let native scroll drive navigation
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (g.current.mode === "pinch" && e.touches.length >= 2) {
        const t = e.touches;
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        const dist = Math.hypot(dx, dy) || 1;
        const s1 = Math.min(MAX_SCALE, Math.max(1, g.current.startScale * (dist / g.current.startDist)));
        const mid = rectPoint((t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2);
        const ratio = s1 / g.current.startScale;
        // Pin the initial focal point, then follow the midpoint so two fingers can drag too.
        z.current.tx = mid.x - ratio * (g.current.startMid.x - g.current.startT.x);
        z.current.ty = mid.y - ratio * (g.current.startMid.y - g.current.startT.y);
        z.current.s = s1;
        clamp();
        apply();
        e.preventDefault();
      } else if (g.current.mode === "pan") {
        const t = e.touches[0];
        z.current.tx = g.current.startT.x + (t.clientX - g.current.panStart.x);
        z.current.ty = g.current.startT.y + (t.clientY - g.current.panStart.y);
        if (Math.hypot(t.clientX - g.current.downPos.x, t.clientY - g.current.downPos.y) > 8) {
          g.current.moved = true;
        }
        clamp();
        apply();
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      const ended = e.touches.length === 0;
      const wasTap =
        ended &&
        !g.current.moved &&
        (g.current.mode === "none" || g.current.mode === "pan") &&
        now - g.current.downTime < 250;

      if (wasTap) {
        const near =
          Math.hypot(
            g.current.downPos.x - g.current.lastTapPos.x,
            g.current.downPos.y - g.current.lastTapPos.y,
          ) < 40;
        if (now - g.current.lastTap < 300 && near) {
          const f = rectPoint(g.current.downPos.x, g.current.downPos.y);
          if (z.current.s > 1) resetZoom();
          else zoomAround(DOUBLE_TAP_SCALE, f.x, f.y);
          g.current.lastTap = 0;
        } else {
          g.current.lastTap = now;
          g.current.lastTapPos = { ...g.current.downPos };
        }
      } else if (g.current.mode === "pinch" || g.current.mode === "pan") {
        if (z.current.s <= 1.01) resetZoom();
        else {
          clamp();
          apply();
          setZoomed(true);
        }
      }
      if (ended) {
        g.current.mode = "none";
        g.current.lastTouchEnd = now;
      }
    };

    // Desktop: double-click toggles zoom; drag pans while zoomed. Guarded against
    // the synthetic mouse events iOS/Chrome emit after a touch.
    const afterTouch = () => Date.now() - g.current.lastTouchEnd < 500;
    let dragging = false;
    let ds = { x: 0, y: 0 };
    let dt = { x: 0, y: 0 };

    const onDblClick = (e: MouseEvent) => {
      if (afterTouch()) return;
      const f = rectPoint(e.clientX, e.clientY);
      if (z.current.s > 1) resetZoom();
      else zoomAround(DOUBLE_TAP_SCALE, f.x, f.y);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (afterTouch() || z.current.s <= 1) return;
      dragging = true;
      ds = { x: e.clientX, y: e.clientY };
      dt = { x: z.current.tx, y: z.current.ty };
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      z.current.tx = dt.x + (e.clientX - ds.x);
      z.current.ty = dt.y + (e.clientY - ds.y);
      clamp();
      apply();
    };
    const onMouseUp = () => {
      dragging = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    el.addEventListener("dblclick", onDblClick);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [apply, clamp, resetZoom, zoomAround]);

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
        <div className="flex items-center gap-2">
          {photos.length > 1 && (
            <button
              onClick={() => setGridOpen(true)}
              aria-label="View all photos in a gallery"
              className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            >
              <LayoutGrid size={20} aria-hidden="true" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close photo viewer"
            className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== idx && i >= 0 && i < photos.length) goTo(i);
        }}
        className={`no-scrollbar flex flex-1 overflow-y-hidden overscroll-contain ${
          zoomed
            ? "touch-none overflow-x-hidden [&_img]:cursor-grab"
            : "touch-pan-x snap-x snap-mandatory overflow-x-auto"
        }`}
      >
        {photos.map((src, i) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-center overflow-hidden">
            <div
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              className="absolute inset-0 will-change-transform"
              style={{ transformOrigin: "0 0" }}
            >
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
          </div>
        ))}
      </div>

      {photos.length > 1 &&
        (photos.length > MAX_DOTS ? (
          <div className="px-6 py-5">
            <div className="mx-auto h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white/80 transition-[width] duration-300 ease-out"
                style={{ width: `${((idx + 1) / photos.length) * 100}%` }}
              />
            </div>
          </div>
        ) : (
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
        ))}

      {gridOpen && (
        <PhotoGrid
          photos={photos}
          onClose={() => setGridOpen(false)}
          onSelect={(i) => {
            const el = trackRef.current;
            if (el) el.scrollLeft = i * el.clientWidth;
            goTo(i);
            setGridOpen(false);
          }}
        />
      )}
    </div>
  );
}
