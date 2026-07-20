"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Info, Map as MapIcon, Maximize2 } from "lucide-react";
import type { Clue, Reveal, Row } from "../_lib/types";
import type { PropertyDetails } from "@/lib/property-details";
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
  position?: string; // forwarded to GuessControls' attempts row
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
  position,
  reveal,
  revealRef,
  onSliderChange,
  onExactModeChange,
  onExactChange,
  onApplyUnit,
  onSubmit,
}: PropertyCardProps) {
  // Full details once the game's over, otherwise the price-scrubbed clue version.
  // Either may be absent (no Redis, or a non-realtor16 provider) — the button
  // only appears when there's something to show.
  const details = reveal?.details ?? clue.details ?? null;

  return (
    <HomeShowcase clue={clue} details={details} revealed={done} unlockedTiers={done ? Infinity : rows.length}>
      {(openDetails) => (
        <>
          <GuessHistory rows={rows} />

          {!done && details && (
            <ClueUnlocks details={details} guessCount={rows.length} onOpen={openDetails} />
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
          position={position}
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
        </>
      )}
    </HomeShowcase>
  );
}

// The non-game shell of a home: photo carousel with the map overlay, title +
// ⓘ details modal, and the facts row — everything about the HOME, nothing about
// guessing. PropertyCard wraps it with the game; the recent-home page (/h/[id])
// wraps it with the earned reveal instead.
export function HomeShowcase({
  clue,
  details,
  revealed,
  unlockedTiers,
  children,
}: {
  clue: Clue;
  details: PropertyDetails | null;
  revealed: boolean;
  unlockedTiers: number;
  // Rendered inside the card body, below the facts row. The function form
  // receives `openDetails` for children that launch the ⓘ modal (ClueUnlocks).
  children?: ReactNode | ((openDetails: () => void) => ReactNode);
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [mapActive, setMapActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const loopResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        {typeof children === "function" ? children(() => setShowAdvanced(true)) : children}
      </div>

      {showAdvanced && details && (
        <AdvancedDetails
          details={details}
          propertyId={clue.id}
          revealed={revealed}
          unlockedTiers={unlockedTiers}
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
    // -mt-2 pulls the facts up against the title (the card's stack gap reads too
    // airy just here); pl-px optically aligns the first stat with the title's glyph edge.
    <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-px text-[13px] text-stone-600 sm:text-sm">
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
