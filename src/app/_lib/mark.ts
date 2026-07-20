// The dillow house mark's shared geometry (100×100 viewBox). The $ is drawn as
// strokes (not <text>) so every surface — DillowMark, icon.svg, apple-icon, the
// OG images — renders the exact same glyph, vertically centered in the door.
// Font <text> isn't supported by the OG ImageResponse renderer, and its baseline
// metrics drifted per surface. Keep icon.svg in lockstep by hand (it's static).
export const MARK = {
  house: "M50 22 L82 50 H74 V80 H26 V50 H18 Z",
  dollarS:
    "M57.3 60.4 C57.3 57.7 54.2 56.5 50 56.5 C45.8 56.5 42.7 57.9 42.7 60.6 C42.7 63.3 46.2 64.4 50 65 C53.9 65.6 57.3 66.7 57.3 69.4 C57.3 72.1 54.2 73.5 50 73.5 C45.8 73.5 42.7 72.3 42.7 69.6",
  dollarBar: "M50 54.6 V75.4",
  dollarStroke: 4.25,
} as const;
