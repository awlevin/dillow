import { isoDay } from "./game-day";
import type { StatEntry } from "./types";

export function getId(): string {
  let id = localStorage.getItem("dillow:id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("dillow:id", id);
  }
  return id;
}

// Streak = consecutive days finished. Active only if the last play was today or
// yesterday; otherwise it has lapsed and reads as 0.
export function loadStreak(): number {
  try {
    const raw = localStorage.getItem("dillow:streak");
    if (!raw) return 0;
    const { count, lastDate } = JSON.parse(raw);
    const today = isoDay(new Date());
    const yest = isoDay(new Date(Date.now() - 86_400_000));
    return lastDate === today || lastDate === yest ? count : 0;
  } catch {
    return 0;
  }
}

export function recordPlay(): number {
  const today = isoDay(new Date());
  const yest = isoDay(new Date(Date.now() - 86_400_000));
  let count = 1;
  let best = 1;
  try {
    const raw = localStorage.getItem("dillow:streak");
    if (raw) {
      const s = JSON.parse(raw);
      best = s.best ?? s.count ?? 0;
      if (s.lastDate === today) return s.count; // already counted today
      if (s.lastDate === yest) count = s.count + 1;
    }
  } catch {
    /* start fresh */
  }
  best = Math.max(best, count);
  localStorage.setItem("dillow:streak", JSON.stringify({ count, lastDate: today, best }));
  return count;
}

export function recordStats(e: StatEntry) {
  try {
    const raw = localStorage.getItem("dillow:stats");
    const arr: StatEntry[] = raw ? JSON.parse(raw) : [];
    if (arr.some((x) => x.date === e.date)) return; // one record per day
    arr.push(e);
    localStorage.setItem("dillow:stats", JSON.stringify(arr.slice(-400)));
  } catch {
    /* ignore */
  }
}
