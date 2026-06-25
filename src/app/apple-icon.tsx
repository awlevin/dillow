import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#059669",
          position: "relative",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 100 100">
          <path d="M50 22 L82 50 H74 V80 H26 V50 H18 Z" fill="#ffffff" />
        </svg>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 81,
            color: "#059669",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 68,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          $
        </div>
      </div>
    ),
    { ...size },
  );
}
