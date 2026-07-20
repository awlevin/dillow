"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// Map for a property location with a pin anchored to its coordinates — only
// rendered in the optional in-play peek, so it never spoils the price.
// - Google (when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set): the Embed API drops a
//   native pin at q=lat,lon.
// - Otherwise: our own Leaflet map on OSM tiles. This replaced the keyless
//   openstreetmap.org embed, whose zoom-out control is locked to the exported
//   bbox (the − button simply never worked) — owning the map gives the full
//   zoom range, a styled pin, and no iframe.
// `fill` makes the map stretch to its container (the map overlay / full-screen
// modal); otherwise it renders the compact, rounded card used for the inline peek.
export function PropertyMap({ lat, lon, fill }: { lat: number; lon: number; fill?: boolean }) {
  const gkey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (gkey) {
    return (
      <div
        className={fill ? "h-full w-full overflow-hidden" : "overflow-hidden rounded-xl border border-stone-200"}
      >
        <iframe
          title="Property location"
          src={`https://www.google.com/maps/embed/v1/place?key=${gkey}&q=${lat},${lon}&zoom=15`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className={fill ? "h-full w-full" : "h-44 w-full"}
        />
      </div>
    );
  }
  return <OsmMap lat={lat} lon={lon} fill={fill} />;
}

// The house pin: an emerald teardrop, drawn inline so no bundler-mangled
// marker-image paths (Leaflet's default icons notoriously 404 under bundlers).
const PIN_SVG = `
<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
  <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 41 15 41s14-15.6 14-26.1C29 7.2 22.7 1 15 1Z"
        fill="#059669" stroke="#ffffff" stroke-width="2"/>
  <circle cx="15" cy="14.5" r="5" fill="#ffffff"/>
</svg>`;

function OsmMap({ lat, lon, fill }: { lat: number; lon: number; fill?: boolean }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    (async () => {
      try {
      // Dynamic import keeps Leaflet out of the main bundle until a map shows.
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      // Zoom control goes top-right: the overlay's Done button owns the top-left
      // corner, and this is also where the old OSM embed kept it.
      map = L.map(el.current, { minZoom: 3, maxZoom: 19, zoomControl: false }).setView([lat, lon], 15);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.marker([lat, lon], {
        icon: L.divIcon({ className: "", html: PIN_SVG, iconSize: [30, 42], iconAnchor: [15, 42] }),
        interactive: false,
      }).addTo(map);
      } catch (err) {
        console.error("[map] leaflet init failed:", err);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon]);

  return (
    <div
      ref={el}
      aria-label="Property location map"
      // `isolate` fences Leaflet's internal z-indexes (panes go up to 1000)
      // inside this box, so sibling chrome like Done/✕/expand can sit above the
      // map with ordinary z values.
      className={
        fill
          ? "isolate h-full w-full overflow-hidden"
          : "isolate h-44 w-full overflow-hidden rounded-xl border border-stone-200"
      }
    />
  );
}
