import { ImageResponse } from "next/og";
import { MARK } from "./_lib/mark";

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
        }}
      >
        <svg width="180" height="180" viewBox="0 0 100 100">
          <path d={MARK.house} fill="#ffffff" />
          <path
            d={MARK.dollarS}
            fill="none"
            stroke="#059669"
            strokeWidth={MARK.dollarStroke}
            strokeLinecap="round"
          />
          <path
            d={MARK.dollarBar}
            fill="none"
            stroke="#059669"
            strokeWidth={MARK.dollarStroke}
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
