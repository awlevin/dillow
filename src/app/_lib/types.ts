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
    finalScore: number;
    pctError: number;
    within: boolean;
    attemptsUsed: number;
  };
  property: FullProperty;
  leaderboard?: { enabled: boolean; rank?: number | null; count?: number };
};

// Per-game history for long-term stats (accuracy by price band, win rate, etc.).
export type StatEntry = {
  date: string;
  price: number;
  pct: number; // abs % error of best guess
  attempts: number;
  won: boolean;
  state: string;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  guess: number;
  score: number;
  pctError: number;
  attempts: number;
};

export type LeaderboardBoard = {
  enabled: boolean;
  today?: boolean;
  date?: string;
  property?: { city: string; state: string; price: number; photos: string[] };
  top?: LeaderboardEntry[];
  count?: number;
  // The requesting player's global placement for the day, if they've joined.
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
  priceFloor?: number;
  priceCeiling?: number;
  rounds?: RoomRound[];
  board?: RoomMemberView[];
  memberCount?: number;
  me?: RoomMemberView | null;
};
