import { NextResponse } from "next/server";
import { getRedis } from "@/lib/leaderboard";

// Player-submitted "something's wrong with this home" reports. Best-effort: a
// report is never worth a 500, so storage hiccups are logged and we still return
// ok. Reports are pushed onto a capped list; a per-player-per-home seen-set
// soft-dedupes so one player can't flood the same listing.
const REASONS = ["Wrong or missing info", "Misleading photos", "Not a real listing", "Other"];
const LIST_KEY = "dillow:reports";
const SEEN_KEY = "dillow:reports:seen";
const MAX_REPORTS = 500;
const SEEN_TTL = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: Request) {
  let body: { propertyId?: unknown; reason?: unknown; note?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const propertyId = typeof body.propertyId === "string" ? body.propertyId : null;
  const reason = typeof body.reason === "string" && REASONS.includes(body.reason) ? body.reason : null;
  const id = typeof body.id === "string" ? body.id : null;
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : "";
  if (!propertyId || !reason || !id) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const report = { propertyId, reason, note, id, at: new Date().toISOString() };

  const redis = getRedis();
  if (!redis) {
    console.log("[/api/report] (no Redis)", report);
    return NextResponse.json({ ok: true });
  }

  try {
    // Soft-dedupe: skip the store when this player has already reported this home.
    const fresh = await redis.sadd(SEEN_KEY, `${id}:${propertyId}`);
    if (fresh > 0) {
      await redis.expire(SEEN_KEY, SEEN_TTL);
      await redis.lpush(LIST_KEY, JSON.stringify(report));
      await redis.ltrim(LIST_KEY, 0, MAX_REPORTS - 1);
    }
  } catch (err) {
    console.error("[/api/report]", err); // storage is best-effort — never fail the report
  }

  return NextResponse.json({ ok: true });
}
