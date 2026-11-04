import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The OG renderer can't see next/font, so without these it falls back to a
// generic sans at one weight and the wordmark comes out thin. Loading Geist
// (the app's own face, OFL — see src/assets/fonts/OFL.txt) keeps link previews
// in the same type as the site.
const dir = join(process.cwd(), "src", "assets", "fonts");

let cached: ReturnType<typeof load> | undefined;

// Read once per server instance; the room OG image renders on every share.
export function ogFonts() {
  return (cached ??= load());
}

async function load() {
  const [black, medium] = await Promise.all([
    readFile(join(dir, "Geist-Black.ttf")),
    readFile(join(dir, "Geist-Medium.ttf")),
  ]);
  return [
    { name: "Geist", data: black, weight: 900 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}
