import { RoomGame } from "@/app/_components/RoomGame";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <RoomGame roomId={room} />;
}
