// The daily property rolls over at midnight Eastern (see GAME_TZ in lib/game.ts).
// Kept in sync here rather than imported so the property pool isn't bundled into
// the client.
const GAME_TZ = "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const isoDay = (d: Date) => dayFmt.format(d);

// Milliseconds until the next property drops — the game rotates at midnight
// Eastern, so we count down to the next Eastern midnight by measuring how far
// into the current Eastern day we are.
const clockFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: GAME_TZ,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function msUntilNextDrop(): number {
  const now = new Date();
  const parts = clockFmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = get("hour") % 24; // some engines emit "24" at midnight
  const elapsedSec = hour * 3600 + get("minute") * 60 + get("second");
  const remMs = (86_400 - elapsedSec) * 1000 - now.getMilliseconds();
  return Math.max(0, remMs);
}
