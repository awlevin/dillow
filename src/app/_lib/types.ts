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
  revealed?: boolean;
  date?: string;
  property?: { city: string; state: string; price: number; photos: string[] };
  top?: LeaderboardEntry[];
  count?: number;
};
