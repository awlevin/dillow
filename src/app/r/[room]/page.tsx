import type { Metadata } from "next";
import { RoomGame } from "@/app/_components/RoomGame";
import { getRoom, roomTitle } from "@/lib/room";

export const dynamic = "force-dynamic";

// Dynamic title/description so a shared room link unfurls as "{name}'s room"
// (the OG image is auto-attached from ./opengraph-image).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ room: string }>;
}): Promise<Metadata> {
  const { room } = await params;
  const r = await getRoom(room).catch(() => null);

  if (!r) {
    const title = "Dillow Challenge";
    const description = "A head-to-head Dillow challenge — 3 bonus rounds. Can you guess the prices?";
    return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
  }

  const title = roomTitle(r.name);
  const description = `Can you beat ${r.name || "them"}? ${r.roundCount} bonus rounds in this Dillow challenge — guess the prices, head to head.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", url: `/r/${room}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RoomPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <RoomGame roomId={room} />;
}
