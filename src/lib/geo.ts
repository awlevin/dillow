// Coarse, no-prompt geolocation from Vercel's edge headers. In production Vercel
// injects approximate city-level coordinates on every request (derived from the
// client IP); we use them only to pick the player's nearest city for the "local"
// home. They're absent in local dev and on non-Vercel hosts, in which case the
// local slot falls back to a wildcard — so this never throws, it just returns null.
// https://vercel.com/docs/edge-network/headers#request-headers
export type Coords = { lat: number; lon: number };

export function geoFromHeaders(headers: Headers): Coords | null {
  const lat = Number(headers.get("x-vercel-ip-latitude"));
  const lon = Number(headers.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}
