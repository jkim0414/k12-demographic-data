import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "K-12 District Data Explorer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Dynamic OG image rendered at the edge. Avoids a static asset and stays
// in sync with the title/sources whenever they change. next/og only
// supports a subset of CSS, so the styling is intentionally minimal.
export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #f8fafc 0%, #eef2ff 60%, #e0e7ff 100%)",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#4338ca",
          }}
        >
          k12-demographic-data.vercel.app
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.05,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          K-12 District Data Explorer
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            fontWeight: 400,
            lineHeight: 1.35,
            color: "#475569",
            maxWidth: 1000,
          }}
        >
          Aggregate enrollment, demographics, discipline, restraint and
          seclusion, staffing, and community data for U.S. schools,
          districts, and state education agencies.
        </div>
        <div style={{ flexGrow: 1 }} />
        <div
          style={{
            display: "flex",
            gap: 14,
            fontSize: 22,
            fontWeight: 600,
            color: "#1e293b",
          }}
        >
          {["NCES CCD", "CRDC", "Census SAIPE", "Census ACS"].map((s) => (
            <span
              key={s}
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: 999,
                background: "#fff",
                border: "1px solid #cbd5e1",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    ),
    size
  );
}
