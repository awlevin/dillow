"use client";

// Map for a property location with an EXACT pin at its coordinates.
// - Google (when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set): the Embed API drops a
//   native pin at q=lat,lon.
// - Otherwise: a keyless OpenStreetMap embed centered on the coordinates, with a
//   pin overlay whose tip sits exactly at the map center (= the property).
export function PropertyMap({ lat, lon }: { lat: number; lon: number }) {
  const gkey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (gkey) {
    const src = `https://www.google.com/maps/embed/v1/place?key=${gkey}&q=${lat},${lon}&zoom=15`;
    return (
      <div className="overflow-hidden rounded-xl border border-stone-200">
        <iframe
          title="Property location"
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-44 w-full"
        />
      </div>
    );
  }

  const d = 0.008;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  // No `marker` param — the centered overlay below is our exact pin (avoids two).
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
  return (
    <div className="relative overflow-hidden rounded-xl border border-stone-200">
      <iframe
        title="Property location"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-44 w-full"
      />
      {/* Pin tip sits exactly at the map center, which is the property's coords. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-3xl drop-shadow"
      >
        📍
      </div>
    </div>
  );
}
