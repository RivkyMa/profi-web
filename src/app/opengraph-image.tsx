import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const alt =
  "PROFI: conditional protection and conditional premium on Robinhood Chain (testnet, mock data)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Static social card, generated at build time. No external fonts or images. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "radial-gradient(circle at 82% 30%, rgba(164,59,208,0.35), transparent 45%), radial-gradient(circle at 70% 70%, rgba(53,216,207,0.28), transparent 50%), #0a0a0b",
          color: "#f3f1ec",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 64 64">
            <path
              d="M32 9 50 15v17c0 11-8 19-18 24-10-5-18-13-18-24V15Z"
              fill="none"
              stroke="#35d8cf"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path d="m32 22 6 10-6 10-6-10Z" fill="#a43bd0" />
          </svg>
          <div style={{ fontSize: 44, letterSpacing: -1 }}>PROFI</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              lineHeight: 1.02,
              letterSpacing: -2,
              maxWidth: 900,
            }}
          >
            Protection for owners. Premium for holders.
          </div>
          <div style={{ fontSize: 30, color: "#a8a59d", maxWidth: 860 }}>
            Structured finance on Robinhood Chain, funded in full by each
            market escrow.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "10px 20px",
            border: "1px solid rgba(53,216,207,0.6)",
            borderRadius: 999,
            fontSize: 24,
            color: "#72eee4",
            letterSpacing: 2,
          }}
        >
          TESTNET / MOCK DATA
        </div>
      </div>
    ),
    size,
  );
}
