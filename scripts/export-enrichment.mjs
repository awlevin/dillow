// Export the runtime enrichment archive (galleries + rich details, fetched from
// realtor16 and cached in Redis) into src/data/enrichment.json — the cold store.
// It ships with every build and survives a Redis wipe or a lapsed realtor16
// subscription. Run it locally after archiving the pool from /admin
// ("📦 Archive pool data"):
//
//   node scripts/export-enrichment.mjs
//   npm run data:push        # upload to the private data store, then redeploy
//
// The file is NOT committed: it is listing content, so it lives in the private
// Vercel Blob store (see scripts/data.mjs). The runtime reads it as the
// fallback tier: Redis first, this file second, realtor16 last (see
// src/lib/property-payload.ts).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./env.mjs";
// Node 23.6+ strips types natively, so the one scrubbing rule lives in one place.
import { stripContactInfo } from "../src/lib/property-details.ts";

const root = process.cwd();

const env = await loadEnv();
const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error("No Upstash credentials found (.env.local / env).");
  process.exit(1);
}

// Values are stored by @upstash/redis, which JSON-serializes them — so each MGET
// result is a JSON string (or null) that parses back to the original value.
async function mget(keys) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify([["MGET", ...keys]]),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const [{ result }] = await res.json();
  return result.map((v) => (v === null ? null : JSON.parse(v)));
}

const pool = JSON.parse(await readFile(path.join(root, "src", "data", "pool.json"), "utf8"));
const ids = pool.properties.map((p) => p.id);

const galleries = {};
const details = {};
const CHUNK = 50;
for (let i = 0; i < ids.length; i += CHUNK) {
  const chunk = ids.slice(i, i + CHUNK);
  const [gs, ds] = await Promise.all([
    mget(chunk.map((id) => `gallery:v2:${id}`)),
    mget(chunk.map((id) => `details:v2:${id}`)),
  ]);
  chunk.forEach((id, j) => {
    if (gs[j]?.length) galleries[id] = gs[j];
    if (ds[j]) details[id] = stripContactInfo(ds[j]);
  });
  process.stdout.write(`\rscanned ${Math.min(i + CHUNK, ids.length)} / ${ids.length}`);
}
console.log();

const out = path.join(root, "src", "data", "enrichment.json");
await writeFile(
  out,
  JSON.stringify({ exportedAt: new Date().toISOString(), galleries, details }),
);
const stats = {
  pool: ids.length,
  galleries: Object.keys(galleries).length,
  details: Object.keys(details).length,
};
console.log(`wrote ${out}`, stats);
