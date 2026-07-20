import { NextResponse } from "next/server";
import { dayKey, getBonusProperties } from "@/lib/game";
import { dailyLimitEnabled } from "@/lib/leaderboard";
import { roundPayload } from "@/lib/property-payload";

export const dynamic = "force-dynamic";
// A cold bonus home may warm its gallery + details with one upstream request;
// give it headroom beyond the default so that fetch doesn't 504.
export const maxDuration = 30;

const MAX_BATCH = 10;

// Bonus homes past the day's slate, for the unlimited main mode. The queue is a
// date-seeded shuffle of the playable pool (see getBonusProperties), so it's
// deterministic per day: `start` pages through it, and `exclude` names the
// caller's slate ids (their slate varies with coarse location, so the server
// can't know it). A reload replays the same request and gets the same homes,
// which is what re-attaches saved progress. Prices are scrubbed the same way
// /api/daily scrubs them.
export async function GET(req: Request) {
  if (await dailyLimitEnabled()) {
    return NextResponse.json({ error: "Bonus homes are turned off." }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const exclude = new Set((url.searchParams.get("exclude") ?? "").split(",").filter(Boolean));
    const start = Math.max(0, Number(url.searchParams.get("start")) || 0);
    const count = Math.min(MAX_BATCH, Math.max(1, Number(url.searchParams.get("count")) || 1));

    const date = dayKey();
    const homes = await Promise.all(
      getBonusProperties(date, exclude, start, count).map(async (property, i) => {
        const { clue } = await roundPayload(property);
        return { slot: start + i, kind: "bonus" as const, propertyId: property.id, clue };
      }),
    );
    return NextResponse.json({ date, homes });
  } catch (err) {
    console.error("[/api/daily/bonus]", err);
    return NextResponse.json({ error: "Could not load a bonus home." }, { status: 502 });
  }
}
