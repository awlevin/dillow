"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Map as MapIcon, Sparkles } from "lucide-react";
import type { Clue, Reveal, Row } from "../_lib/types";
import { propertyTitle } from "../_lib/format";
import { AdvancedDetails } from "./AdvancedDetails";
import { GuessControls } from "./GuessControls";
import { GuessHistory } from "./GuessHistory";
import { PropertyCarousel } from "./PropertyCarousel";
import { RevealCard } from "./RevealCard";

type PropertyCardProps = {
  clue: Clue;
  rows: Row[];
  done: boolean;
  remaining: number;
  guessValue: number;
  lo: number;
  hi: number;
  t: number;
  exactMode: boolean;
  exact: string;
  submitting: boolean;
  error: string | null;
  reveal: Reveal | null;
  revealRef: RefObject<HTMLDivElement | null>;
  shareText: string;
  onSliderChange: (value: number) => void;
  onExactModeChange: (enabled: boolean) => void;
  onExactChange: (value: string) => void;
  onApplyUnit: (mult: number) => void;
  onSubmit: () => void;
};

export function PropertyCard({
  clue,
  rows,
  done,
  remaining,
  guessValue,
  lo,
  hi,
  t,
  exactMode,
  exact,
  submitting,
  error,
  reveal,
  revealRef,
  shareText,
  onSliderChange,
  onExactModeChange,
  onExactChange,
  onApplyUnit,
  onSubmit,
}: PropertyCardProps) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [mapActive, setMapActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const loopResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhotoIdx = useRef(0);

  // Full details once the game's over, otherwise the price-scrubbed clue version.
  // Either may be absent (no Redis, or a non-realtor16 provider) — the button
  // only appears when there's something to show.
  const details = reveal?.details ?? clue.details ?? null;

  const hasMap = clue.lat != null && clue.lon != null;
  const loop = clue.photos.length > 0 && clue.photos.length + (hasMap ? 1 : 0) > 1;
  const mapIdx = clue.photos.length;

  const toggleMap = () => {
    const el = carouselRef.current;
    if (!el) return;
    const lead = loop ? 1 : 0;
    if (photoIdx === mapIdx) {
      // Already on the map — go back to whichever photo we came from.
      el.scrollTo({ left: (prevPhotoIdx.current + lead) * el.clientWidth });
      setMapActive(false);
    } else {
      prevPhotoIdx.current = photoIdx;
      el.scrollTo({ left: (mapIdx + lead) * el.clientWidth });
      setMapActive(true);
    }
  };

  useEffect(() => {
    const el = carouselRef.current;
    if (el && loop) el.scrollLeft = el.clientWidth;
  }, [loop, clue]);

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <PropertyCarousel
        clue={clue}
        done={done}
        hasMap={hasMap}
        loop={loop}
        mapActive={mapActive}
        photoIdx={photoIdx}
        carouselRef={carouselRef}
        loopResetRef={loopResetRef}
        setPhotoIdx={setPhotoIdx}
        setMapActive={setMapActive}
      />

      <div className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-5">
        <p className="text-lg font-semibold text-stone-800">{propertyTitle(clue)}</p>

        <PropertyFacts
          clue={clue}
          onToggleMap={hasMap ? toggleMap : undefined}
          onAdvanced={details ? () => setShowAdvanced(true) : undefined}
        />
        <GuessHistory rows={rows} />

        {!done ? (
          <GuessControls
            rowCount={rows.length}
            remaining={remaining}
            guessValue={guessValue}
            lo={lo}
            hi={hi}
            t={t}
            exactMode={exactMode}
            exact={exact}
            submitting={submitting}
            error={error}
            onSliderChange={onSliderChange}
            onExactModeChange={onExactModeChange}
            onExactChange={onExactChange}
            onApplyUnit={onApplyUnit}
            onSubmit={onSubmit}
          />
        ) : (
          <div ref={revealRef}>
            <RevealCard reveal={reveal!} rows={rows} shareText={shareText} />
          </div>
        )}
      </div>

      {showAdvanced && details && (
        <AdvancedDetails details={details} revealed={done} onClose={() => setShowAdvanced(false)} />
      )}
    </section>
  );
}

function PropertyFacts({
  clue,
  onToggleMap,
  onAdvanced,
}: {
  clue: Clue;
  onToggleMap?: () => void;
  onAdvanced?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
      {clue.beds != null && <Stat label="Beds" value={clue.beds} />}
      {clue.baths != null && <Stat label="Baths" value={clue.baths} />}
      {clue.sqft != null && <Stat label="Sq Ft" value={clue.sqft.toLocaleString()} />}
      {clue.yearBuilt != null && <Stat label="Built" value={clue.yearBuilt} />}
      <div className="ml-auto flex items-center gap-3">
        {onAdvanced && (
          <button
            onClick={onAdvanced}
            className="flex items-center gap-1 font-semibold text-emerald-700 transition hover:text-emerald-900"
          >
            <Sparkles size={15} aria-hidden="true" /> Advanced
          </button>
        )}
        {onToggleMap && (
          <button
            onClick={onToggleMap}
            aria-label="Toggle the map view"
            className="text-stone-400 transition hover:text-emerald-600"
          >
            <MapIcon size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="font-semibold text-stone-800">{value}</span>{" "}
      <span className="text-stone-400">{label}</span>
    </span>
  );
}
