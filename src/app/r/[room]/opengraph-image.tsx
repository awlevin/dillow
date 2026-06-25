import { ImageResponse } from "next/og";
import { getRoom, roomTitle } from "@/lib/room";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Dillow challenge room";

// Dynamic share image for a room link — "{name}'s room", Dillow-branded.
export default async function Image({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  const r = await getRoom(room).catch(() => null);
  const title = r ? roomTitle(r.name) : "Dillow Challenge";
  const rounds = r?.roundCount ?? 3;
  const bands = ["#ef4444", "#f97316", "#eab308", "#22c55e"];

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #065f46, #047857)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: 60,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 28,
            background: "#fbbf24",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 30,
          }}
        >
          <svg
            width="66"
            height="66"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#78350f"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>
        <div style={{ fontSize: 86, fontWeight: 800, letterSpacing: -3, textAlign: "center", lineHeight: 1.05 }}>
          {title}
        </div>
        <div style={{ fontSize: 38, opacity: 0.92, marginTop: 16 }}>
          {`Dillow Challenge · ${rounds} bonus rounds`}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 42 }}>
          {bands.map((c, i) => (
            <div key={i} style={{ display: "flex", width: 48, height: 48, borderRadius: 10, background: c }} />
          ))}
          <div
            style={{
              display: "flex",
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "#16a34a",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
