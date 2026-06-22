import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDailyProperty, dayKeyOffset } from "@/lib/game";
import { fetchDetails } from "@/lib/providers/realtor16";

// MANUAL, budget-aware enrichment. The daily property is deterministic, so we
// only fetch full galleries (+ year_built) for the listings that will actually
// be featured over the next `days` days — one realtor16 request per listing.
// Idempotent: listings already enriched (>3 photos) are skipped, so re-running
// only spends requests on new days. Token-guarded in production like /refresh.
export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const token = params.get("token");
  if (process.env.NODE_ENV === "production" && token !== process.env.REFRESH_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const days = Math.min(20, Math.max(1, Number(params.get("days") ?? 10)));

  // Which listings will be featured over the next `days` days.
  const ids = new Set<string>();
  for (let k = 0; k < days; k++) {
    try {
      ids.add(getDailyProperty(dayKeyOffset(k)).id);
    } catch {
      /* empty pool — ignore */
    }
  }

  const file = path.join(process.cwd(), "src", "data", "pool.json");
  const snap = JSON.parse(await readFile(file, "utf8"));
  const byId = new Map<string, { id: string; city: string; photos: string[]; yearBuilt: number | null }>(
    snap.properties.map((p: { id: string }) => [p.id, p]),
  );

  let requests = 0;
  let enriched = 0;
  let skipped = 0;
  const results: Array<{ id: string; city: string; photos: number; yearBuilt: number | null }> = [];

  for (const id of ids) {
    const prop = byId.get(id);
    if (!prop) continue;
    if (prop.photos.length > 3) {
      skipped++; // already enriched
      continue;
    }
    requests++;
    try {
      const det = await fetchDetails(id);
      if (det && det.photos.length > prop.photos.length) {
        prop.photos = det.photos;
        if (det.yearBuilt != null) prop.yearBuilt = det.yearBuilt;
        enriched++;
        results.push({ id, city: prop.city, photos: det.photos.length, yearBuilt: prop.yearBuilt });
      }
    } catch (err) {
      console.warn(`[enrich] ${id} failed:`, err);
    }
  }

  await writeFile(file, JSON.stringify(snap, null, 2));
  return NextResponse.json({ days, featured: ids.size, requests, enriched, skipped, results });
}
