import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { dayKey, getDailyProperty, pickRoomProperties } from "@/lib/game";
import { getDailyOffset } from "@/lib/leaderboard";
import { createRoom, roomsEnabled, type Room } from "@/lib/room";

export const dynamic = "force-dynamic";

const ROUND_COUNT = 3;
// Unambiguous alphabet (no 0/o/1/l/i) for short, shareable, speakable codes.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function roomCode(len = 7): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

// Create a challenge room for today: three bonus properties (excluding the daily
// home), seeded by the room code so every member plays the same set. The creator
// is identified but not yet on the board — they join when they start playing.
export async function POST(req: Request) {
  if (!roomsEnabled()) {
    return NextResponse.json({ error: "Rooms are not available." }, { status: 503 });
  }

  let body: { id?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Missing player id." }, { status: 400 });

  try {
    const date = dayKey();
    const daily = getDailyProperty(date, await getDailyOffset(date));

    // Generate a unique code, retrying on the (very rare) NX collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = roomCode();
      const props = pickRoomProperties(candidate, ROUND_COUNT, daily.id);
      const room: Room = {
        id: candidate,
        date,
        createdBy: id,
        propertyIds: props.map((p) => p.id),
        roundCount: props.length,
      };
      if (await createRoom(room)) {
        return NextResponse.json({ roomId: candidate });
      }
    }
    return NextResponse.json({ error: "Could not create a room. Try again." }, { status: 502 });
  } catch (err) {
    console.error("[/api/room]", err);
    return NextResponse.json({ error: "Could not create a room." }, { status: 502 });
  }
}
