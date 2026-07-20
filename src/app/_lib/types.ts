import type { PropertyDetails } from "@/lib/property-details";
import type { CommunityStats } from "@/lib/types";

export type { CommunityStats };

export type Clue = {
  id: string;
  city: string;
  state: string;
  lat: number | null;
  lon: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  photos: string[];
  details?: PropertyDetails | null; // scrubbed of price-revealing fields pre-reveal
};

export type Row = {
  guess: number;
  band: string;
  direction: "higher" | "lower" | "match";
};

export type FullProperty = Clue & {
  price: number;
  address?: string;
  lat: number | null;
  lon: number | null;
};

export type Reveal = {
  result: {
    bestGuess: number;
    bestScore: number;
    pctError: number;
    within: boolean;
    attemptsUsed: number;
  };
  property: FullProperty;
  details?: PropertyDetails | null; // full set, including price-revealing fields
  communityStats?: CommunityStats | null; // how the crowd's first guesses compare to the price
  leaderboard?: { enabled: boolean; rank?: number | null; count?: number };
};

// Per-game history for long-term stats (accuracy by price band, win rate, etc.).
// One entry per home played (keyed by date + propertyId), so all three of a day's
// homes contribute.
export type StatEntry = {
  date: string;
  propertyId: string;
  price: number;
  pct: number; // abs % error of best guess
  attempts: number;
  won: boolean;
  state: string;
  city?: string; // added later — older saved entries won't have it
};

// ── The daily slate: three homes a day (plus endless bonus homes) ────────────
export type SlotKind = "standard" | "premium" | "local" | "wildcard" | "bonus";

// One of the day's homes as /api/daily serves it: a price-scrubbed clue plus the
// id used to score guesses and look up its all-time leaderboard.
export type DailyHome = {
  slot: number;
  kind: SlotKind;
  propertyId: string;
  clue: Clue;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  guess: number;
  score: number;
  pctError: number;
  attempts: number;
};

// A single home's all-time leaderboard. `locked` while the caller hasn't finished
// this home yet (only the headcount is returned, so other players' guesses can't
// leak the price mid-game).
export type PropertyBoard = {
  enabled: boolean;
  propertyId?: string;
  locked?: boolean;
  top?: LeaderboardEntry[];
  count?: number;
  // The requesting player's placement on this home's board, if they've joined.
  me?: { rank: number; entry: LeaderboardEntry | null } | null;
};

// ── Challenge rooms ──────────────────────────────────────────────────────────
export type RoomResult = {
  bestGuess: number;
  bestScore: number;
  finalScore: number;
  pctError: number;
  within: boolean;
  attemptsUsed: number;
};

// One round as the room page sees it: a clue while unfinished, a full reveal once
// the viewer has completed it.
export type RoomRound = {
  index: number;
  clue: Clue;
  done: boolean;
  property?: FullProperty;
  details?: PropertyDetails | null;
  communityStats?: CommunityStats | null;
  result?: RoomResult;
};

export type RoomRoundScore = { score: number; pct: number; attempts: number };

export type RoomMemberView = {
  id: string;
  name: string;
  total: number;
  roundsDone: number;
  rounds: (RoomRoundScore | null)[];
};

export type RoomInfo = {
  enabled: boolean;
  error?: string;
  room?: { id: string; date: string; roundCount: number; name: string };
  isOwner?: boolean;
  priceFloor?: number;
  priceCeiling?: number;
  rounds?: RoomRound[];
  board?: RoomMemberView[];
  memberCount?: number;
  me?: RoomMemberView | null;
};
