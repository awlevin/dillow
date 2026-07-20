import type { Reveal, Row } from "./types";

// Local mode's client-side state: where the player chose to play, and their
// per-day progress through that area's home queue. Both live in localStorage —
// the queue itself is deterministic per (day, area) on the server, so saving
// just the served ids + per-home progress is enough to re-attach after reloads.

export type LocalSpot = {
  city: string;
  state: string;
  lat: number;
  lon: number;
};

const SPOT_KEY = "dillow:local:spot";

export function loadLocalSpot(): LocalSpot | null {
  try {
    const raw = localStorage.getItem(SPOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalSpot;
    return typeof s.city === "string" && Number.isFinite(s.lat) && Number.isFinite(s.lon) ? s : null;
  } catch {
    return null;
  }
}

export function saveLocalSpot(spot: LocalSpot): void {
  localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
}

// Progress is keyed by day AND area, so switching cities (or the day rolling
// over) starts a fresh run without clobbering the other area's progress.
export type LocalSlot = { rows: Row[]; reveal: Reveal | null };
export type LocalProgress = { ids: string[]; slots: Record<number, LocalSlot> };

const runKey = (date: string, spot: LocalSpot) => `dillow:local:${date}:${spot.city}|${spot.state}`;

export function loadLocalProgress(date: string, spot: LocalSpot): LocalProgress {
  try {
    const raw = localStorage.getItem(runKey(date, spot));
    if (!raw) return { ids: [], slots: {} };
    const p = JSON.parse(raw) as LocalProgress;
    return Array.isArray(p.ids) ? { ids: p.ids, slots: p.slots ?? {} } : { ids: [], slots: {} };
  } catch {
    return { ids: [], slots: {} };
  }
}

export function saveLocalProgress(
  date: string,
  spot: LocalSpot,
  ids: string[],
  slot: number,
  data: LocalSlot,
): void {
  const cur = loadLocalProgress(date, spot);
  cur.slots[slot] = data;
  localStorage.setItem(runKey(date, spot), JSON.stringify({ ids, slots: cur.slots }));
}
