import { NextResponse } from "next/server";
import { getPropertyById } from "@/lib/game";
import { roundPayload } from "@/lib/property-payload";

export const dynamic = "force-dynamic";
// A cold home may warm its gallery + details with one upstream request.
export const maxDuration = 30;

// The price-SAFE view of a single pool home — exactly the clue the game serves
// before any guess (enriched gallery + scrubbed details), so this can never leak
// an unplayed home's price. Backs the /h/[propertyId] recent-home page, which
// pairs it with the reveal (price, result, listing links) the player already
// earned and holds in local history.
export async function GET(_req: Request, ctx: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await ctx.params;
  const property = getPropertyById(propertyId);
  if (!property) return NextResponse.json({ error: "Unknown home." }, { status: 404 });

  try {
    const { clue } = await roundPayload(property);
    return NextResponse.json({ clue });
  } catch (err) {
    console.error("[/api/home]", err);
    return NextResponse.json({ error: "Could not load this home." }, { status: 502 });
  }
}
