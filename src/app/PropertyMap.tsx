"use client";

// Map for a property location with a pin anchored to its coordinates — only
// rendered in the optional in-play peek, so it never spoils the price.
// - Google (when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set): the Embed API drops a
//   native pin at q=lat,lon.
// - Otherwise: a keyless OpenStreetMap embed with a real (Leaflet) marker via the
//   `marker` param, so the pin stays put as you pan and zoom out.
export function PropertyMap({ lat, lon }: { lat: number; lon: number }) {
  const gkey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const src = gkey
    ? `https://www.google.com/maps/embed/v1/place?key=${gkey}&q=${lat},${lon}&zoom=15`
    : osmSrc(lat, lon);

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

function osmSrc(lat: number, lon: number): string {
  const d = 0.01;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}
