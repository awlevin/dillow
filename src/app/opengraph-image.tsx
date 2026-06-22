import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Dillow — guess the home's price, a new home every day";

export default function OpengraphImage() {
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
          background: "linear-gradient(135deg, #065f46, #059669)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 132,
            height: 132,
            borderRadius: 30,
            background: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 28,
          }}
        >
          <div style={{ fontSize: 88, fontWeight: 800, color: "#059669" }}>?</div>
        </div>
        <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: -5 }}>dillow</div>
        <div style={{ fontSize: 40, opacity: 0.92, marginTop: 6 }}>
          Guess the home&apos;s price. New home every day.
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {bands.map((c, i) => (
            <div key={i} style={{ display: "flex", width: 56, height: 56, borderRadius: 12, background: c }} />
          ))}
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "#16a34a",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="34"
              height="34"
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
