"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Info, Map as MapIcon, Maximize2 } from "lucide-react";
import type { Clue, Reveal, Row } from "../_lib/types";
import { propertyTitle } from "../_lib/format";
import { AdvancedDetails } from "./AdvancedDetails";
import { ClueUnlocks } from "./ClueUnlocks";
import { GuessControls } from "./GuessControls";
import { GuessHistory } from "./GuessHistory";
import { MapModal } from "./MapModal";
import { PropertyCarousel } from "./PropertyCarousel";
import { PropertyMap } from "./PropertyMap";
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

  // Full details once the game's over, otherwise the price-scrubbed clue version.
  // Either may be absent (no Redis, or a non-realtor16 provider) — the button
  // only appears when there's something to show.
  const details = reveal?.details ?? clue.details ?? null;

  const hasMap = clue.lat != null && clue.lon != null;
  const loop = clue.photos.length > 1;

  useEffect(() => {
    const el = carouselRef.current;
    if (el && loop) el.scrollLeft = el.clientWidth;
  }, [loop, clue]);

  // The map lives OVER the photos, not among them: it opens only from the Map
  // button in the facts row and closes via Done or that same button — never by
  // swiping, so browsing photos can't accidentally land you on a map.
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="relative">
        <PropertyCarousel
          clue={clue}
          loop={loop}
          photoIdx={photoIdx}
          carouselRef={carouselRef}
          loopResetRef={loopResetRef}
          setPhotoIdx={setPhotoIdx}
        />
        {hasMap && mapActive && (
          <MapOverlay lat={clue.lat!} lon={clue.lon!} onDone={() => setMapActive(false)} />
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-lg font-semibold text-stone-800">{propertyTitle(clue)}</p>
          {details && (
            <button
              onClick={() => setShowAdvanced(true)}
              aria-label="Property details"
              className="mt-0.5 shrink-0 text-stone-400 transition hover:text-stone-600"
            >
              <Info size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <PropertyFacts
          clue={clue}
          onToggleMap={hasMap ? () => setMapActive(!mapActive) : undefined}
          mapActive={mapActive}
        />
        <GuessHistory rows={rows} />

        {!done && details && (
          <ClueUnlocks details={details} guessCount={rows.length} onOpen={() => setShowAdvanced(true)} />
        )}

        {!done ? (
          <GuessControls
            rows={rows}
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
            <RevealCard reveal={reveal!} rows={rows} />
          </div>
        )}
      </div>

      {showAdvanced && details && (
        <AdvancedDetails
          details={details}
          propertyId={clue.id}
          revealed={done}
          unlockedTiers={done ? Infinity : rows.length}
          onClose={() => setShowAdvanced(false)}
        />
      )}
    </section>
  );
}

function PropertyFacts({
  clue,
  onToggleMap,
  mapActive = false,
}: {
  clue: Clue;
  onToggleMap?: () => void;
  mapActive?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stone-600">
      {clue.beds != null && <Stat label="Beds" value={clue.beds} />}
      {clue.baths != null && <Stat label="Baths" value={clue.baths} />}
      {clue.sqft != null && <Stat label="Sq Ft" value={clue.sqft.toLocaleString()} />}
      {clue.yearBuilt != null && <Stat label="Built" value={clue.yearBuilt} />}
      {onToggleMap && (
        <button
          onClick={onToggleMap}
          aria-label={mapActive ? "Hide the map view" : "Show the map view"}
          aria-pressed={mapActive}
          className={`ml-auto flex items-center gap-1 font-medium transition ${
            mapActive ? "text-emerald-600" : "text-stone-400 hover:text-emerald-600"
          }`}
        >
          <MapIcon size={17} aria-hidden="true" />
          Map
        </button>
      )}
    </div>
  );
}

// The map, laid over the photo area while open. Done (or the Map toggle that
// opened it) closes it; the corner control expands to the full-screen modal.
function MapOverlay({ lat, lon, onDone }: { lat: number; lon: number; onDone: () => void }) {
  const [fullMap, setFullMap] = useState(false);
  return (
    <div className="absolute inset-0 z-30 bg-stone-100">
      <PropertyMap lat={lat} lon={lon} fill />
      <button
        onClick={onDone}
        className="absolute left-2 top-2 z-10 rounded-full bg-stone-900/70 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-stone-900/85"
      >
        Done
      </button>
      <button
        onClick={() => setFullMap(true)}
        aria-label="Expand map to full screen"
        className="absolute bottom-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-stone-900/70 text-white shadow transition hover:bg-stone-900/85"
      >
        <Maximize2 size={15} aria-hidden="true" />
      </button>
      {fullMap && <MapModal lat={lat} lon={lon} onClose={() => setFullMap(false)} />}
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
