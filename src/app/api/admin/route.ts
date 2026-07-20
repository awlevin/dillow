import { NextResponse } from "next/server";
import { dayKey, getDailyProperty, getPremiumProperty, getPool } from "@/lib/game";
import type { Property } from "@/lib/types";
import { fetchDetails } from "@/lib/providers/realtor16";
import {
  getDailyOffset,
  bumpDailyOffset,
  clearDailyState,
  getGallery,
  saveGallery,
  saveDetails,
  archivedFlags,
  deleteWarmTried,
  leaderboardEnabled,
  dailyLimitEnabled,
  setDailyLimit,
} from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
// Enrich/rotate make an upstream realtor16 request that can be slow; give it
// headroom beyond the default so a slow gallery fetch doesn't 504 with an empty
// body (which surfaces to the client as "Unexpected end of JSON input").
export const maxDuration = 30;

// Set ADMIN_PASSWORD to override; defaults to the value Aaron chose.
const PASSWORD = process.env.ADMIN_PASSWORD ?? "8228";

function summary(p: Property, photos: string[]) {
  return {
    city: p.city,
    state: p.state,
    price: p.price,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    photos: photos.length,
    photo: photos[0] ?? null,
  };
}

// Effective photos = the cached runtime gallery if richer, else snapshot photos.
async function effectivePhotos(p: Property): Promise<string[]> {
  const g = await getGallery(p.id);
  return g && g.length > p.photos.length ? g : p.photos;
}

// Fetch + cache a full gallery AND the rich details from one realtor16 request.
// No-op for the gallery if already rich or the quota is exhausted (fetchDetails
// returns null on a non-OK response). Details are cached whenever present so the
// daily route never has to spend a second request to warm them.
async function enrich(p: Property): Promise<string[]> {
  const current = await effectivePhotos(p);
  if (current.length > 3) return current; // already rich
  const det = await fetchDetails(p.id);
  if (!det) return current;
  if (det.details) await saveDetails(p.id, det.details);
  if (det.photos.length > current.length) {
    await saveGallery(p.id, det.photos);
    return det.photos;
  }
  return current;
}

export async function POST(req: Request) {
  let body: { password?: unknown; action?: unknown; on?: unknown; batch?: unknown; exclude?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.password !== "string" || body.password !== PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const date = dayKey();

  // Always return JSON, even on failure: an unhandled throw (slow/failed
  // realtor16 fetch, Redis blip) would otherwise return an empty body and the
  // client's res.json() would throw "Unexpected end of JSON input".
  try {
    if (body.action === "verify") {
      const property = getDailyProperty(date, await getDailyOffset(date));
      return NextResponse.json({
        ok: true,
        current: summary(property, await effectivePhotos(property)),
        dailyLimit: await dailyLimitEnabled(),
      });
    }

    // Flip the classic 3-homes-per-day cap on/off (off = endless bonus homes).
    if (body.action === "limit") {
      if (!leaderboardEnabled()) {
        return NextResponse.json({ error: "Redis not configured — cannot store the flag." }, { status: 503 });
      }
      const on = body.on === true;
      await setDailyLimit(on);
      return NextResponse.json({ ok: true, dailyLimit: on });
    }

    if (body.action === "enrich") {
      const offset = await getDailyOffset(date);
      const property = getDailyProperty(date, offset);
      const photos = await enrich(property);
      // Also pre-warm the day's "big spender" home (global, like the standard one)
      // so its gallery + details are hot before anyone reaches it. Best-effort.
      const premium = getPremiumProperty(date, new Set([property.id]));
      if (premium) await enrich(premium).catch(() => {});
      return NextResponse.json({ ok: true, current: summary(property, photos) });
    }

    if (body.action === "rotate") {
      if (!leaderboardEnabled()) {
        return NextResponse.json({ error: "Redis not configured — cannot rotate." }, { status: 503 });
      }
      const offset = await bumpDailyOffset(date);
      const cleared = await clearDailyState(date);
      const property = getDailyProperty(date, offset);
      const photos = await enrich(property); // give the new property a full gallery
      return NextResponse.json({ ok: true, rotated: true, offset, cleared, current: summary(property, photos) });
    }

    // Archive the pool: bulk-warm every home's full gallery + rich details into
    // Redis while the realtor16 subscription is live, so the app still demos with
    // complete data if the subscription later lapses. One POST = one BATCH; the
    // client loops until `remaining` hits 0. Each home costs one realtor16 request.
    if (body.action === "archive") {
      if (!leaderboardEnabled()) {
        return NextResponse.json({ error: "Redis not configured — cannot archive." }, { status: 503 });
      }
      const pool = getPool(); // already id-sorted → a stable scan order across batches
      const total = pool.length;
      // Keep the batch inside maxDuration (30s) at concurrency 3: default 12,
      // hard-clamped to 1–15 so a caller can't ask for a batch that would 504.
      const rawBatch = typeof body.batch === "number" ? Math.floor(body.batch) : 12;
      const batch = Math.max(1, Math.min(15, Number.isFinite(rawBatch) && rawBatch > 0 ? rawBatch : 12));
      // Homes the client has already settled as unfetchable (empty/failed on a
      // prior batch). Carrying them here is what guarantees the loop terminates —
      // they never get a full pair of keys, so without this they'd rescan forever.
      const exclude = new Set(
        Array.isArray(body.exclude) ? body.exclude.filter((x): x is string => typeof x === "string") : [],
      );

      // One pipelined EXISTS pass over the whole pool (key names only, no values)
      // to find the homes still missing a full gallery + details pair.
      const flags = await archivedFlags(pool.map((p) => p.id));
      const todo = pool.filter((p, i) => !(flags[i].gallery && flags[i].details) && !exclude.has(p.id));
      const candidates = todo.slice(0, batch);

      const empty: string[] = []; // provider has no data for these
      const failed: string[] = []; // fetch threw (network/parse) — retryable
      let archived = 0;
      let lapsed = false; // subscription 403 — abort the whole batch, loudly

      // Bounded concurrency 3 so a batch of 15 stays well inside maxDuration.
      let next = 0;
      async function worker() {
        while (next < candidates.length && !lapsed) {
          const p = candidates[next++];
          try {
            const det = await fetchDetails(p.id);
            if (!det || det.photos.length === 0) {
              empty.push(p.id); // counted as processed, but nothing to cache
              continue;
            }
            // Cache the gallery even if it's not richer than the snapshot — for the
            // archive, a guaranteed cache hit matters more than a size win.
            await saveGallery(p.id, det.photos);
            if (det.details) await saveDetails(p.id, det.details);
            // No details means this home can never satisfy the both-keys check —
            // report it as settled so the client excludes it and the loop can't
            // re-buy the same fetch forever. (Unreachable today: parseDetails
            // always returns an object — this guards a provider-shape change.)
            else empty.push(p.id);
            await deleteWarmTried(p.id); // admin intent overrides the enrich back-off
            archived++;
          } catch (err) {
            if (err instanceof Error && err.message.includes("not subscribed")) {
              lapsed = true;
              break;
            }
            console.error(`[admin] archive ${p.id} failed:`, err);
            failed.push(p.id);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, worker));

      if (lapsed) {
        return NextResponse.json(
          { error: "realtor16 says the RapidAPI subscription is inactive (403) — archive aborted." },
          { status: 503 },
        );
      }

      // Everything in this batch is now settled: archived homes have both keys;
      // empty/failed ones are returned so the client can exclude them next call.
      // So the not-yet-archived count drops by exactly the batch we processed.
      const remaining = todo.length - candidates.length;
      return NextResponse.json({ ok: true, archived, empty, failed, remaining, total });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(`[admin] ${String(body.action)} failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 500 },
    );
  }
}
