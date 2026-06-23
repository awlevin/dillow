// One-off maintenance: enrich the committed snapshot's galleries in place and
// drop any listing below the minimum-photo guarantee — WITHOUT pulling a fresh
// batch of listings (that's what POST /api/refresh does). Spends one realtor16
// request per under-filled listing.
//
//   bun run scripts/enrich-pool.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Property } from "@/lib/types";
import { enrichPool } from "@/lib/providers";
import { MIN_PHOTOS } from "@/lib/game";

const file = path.join(process.cwd(), "src", "data", "pool.json");
const snap = JSON.parse(await readFile(file, "utf8")) as {
  fetchedAt: string;
  properties: Property[];
};

const before = snap.properties.length;
const enriched = await enrichPool(snap.properties);
const properties = enriched.filter((p) => p.photos.length >= MIN_PHOTOS);

await writeFile(
  file,
  JSON.stringify({ fetchedAt: new Date().toISOString(), properties }, null, 2),
);

const dropped = before - properties.length;
console.log(
  `Enriched ${before} listings → kept ${properties.length} with ≥${MIN_PHOTOS} photos (dropped ${dropped}).`,
);
