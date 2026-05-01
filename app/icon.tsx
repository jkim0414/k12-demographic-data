import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// 32×32 favicon: indigo "K12" mark on a rounded white tile. Generated
// via next/og so we don't ship a binary asset.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4338ca",
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          borderRadius: 6,
        }}
      >
        K12
      </div>
    ),
    size
  );
}
