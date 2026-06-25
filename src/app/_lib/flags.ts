"use client";

import { useSyncExternalStore } from "react";

// ── Client-only feature flags ────────────────────────────────────────────────
// Flags live entirely in localStorage (no server involvement) so anyone can flip
// experiments on/off from /flags. Add a flag by appending to FLAGS; gate UI with
// the useFlag(key) hook or read isFlagEnabled(key) imperatively.

export type FlagKey = "rooms";

export type FlagDef = { key: FlagKey; title: string; description: string };

export const FLAGS: FlagDef[] = [
  {
    key: "rooms",
    title: "Challenge Rooms",
    description:
      "After finishing the daily home, share a link to unlock 3 bonus rounds and compete with the friends you invite on a private leaderboard.",
  },
];

const STORAGE_KEY = "dillow:flags";
const EVENT = "dillow:flags-changed";

type FlagMap = Partial<Record<FlagKey, boolean>>;

function read(): FlagMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as FlagMap;
  } catch {
    return {};
  }
}

export function getFlags(): FlagMap {
  return read();
}

export function isFlagEnabled(key: FlagKey): boolean {
  return read()[key] === true;
}

export function setFlag(key: FlagKey, on: boolean): void {
  if (typeof window === "undefined") return;
  const next = { ...read(), [key]: on };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Notify same-tab subscribers (storage only fires cross-tab).
  window.dispatchEvent(new Event(EVENT));
}

// ── React binding ────────────────────────────────────────────────────────────
function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// SSR-safe: the server snapshot is always false (flags are client-only), and the
// client reads localStorage on mount and re-renders on any flag change. Returns a
// primitive, so useSyncExternalStore won't loop on referential equality.
export function useFlag(key: FlagKey): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isFlagEnabled(key),
    () => false,
  );
}
