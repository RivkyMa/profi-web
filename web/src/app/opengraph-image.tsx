import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export const alt =
  "PROFI: conditional protection and conditional premium on Robinhood Chain (testnet, mock data)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "Protection for owners. Premium for holders.";
const SUBLINE =
  "Structured finance on Robinhood Chain, funded in full by each market escrow.";
const BADGE = "TESTNET / MOCK DATA";

/**
 * One subsetted TTF from Google Fonts (satori cannot read woff2). Only the
 * glyphs of `text` are requested, a few KB per font. Any failure returns null
 * and the card falls back to the default font: a build must never depend on
 * this fetch.
 */
async function loadFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const url = css.match(
      /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/,
    )?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Static social card, generated at build time. Same three families as the site (D-048). */
export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/profi-wordmark.png"), "base64");
  const [sora, manrope, plex] = await Promise.all([
    loadFont("Sora", 600, `PROFI${HEADLINE}`),
    loadFont("Manrope", 500, SUBLINE),
    loadFont("IBM Plex Mono", 500, BADGE),
  ]);
  const fonts: {
    name: string;
    data: ArrayBuffer;
    weight: 500 | 600;
    style: "normal";
  }[] = [];
  if (sora) fonts.push({ name: "Sora", data: sora, weight: 600, style: "normal" });
  if (manrope) fonts.push({ name: "Manrope", data: manrope, weight: 500, style: "normal" });
  if (plex) fonts.push({ name: "IBM Plex Mono", data: plex, weight: 500, style: "normal" });
  const display = sora ? "Sora" : "sans-serif";
  const text = manrope ? "Manrope" : "sans-serif";
  const mono = plex ? "IBM Plex Mono" : "sans-serif";

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
          fontFamily: "sans-serif", // overridden per element once the fonts load
        }}
      >
        <div style={{ display: "flex", position: "relative", width: 249, height: 80, overflow: "hidden" }}>
          {/* ImageResponse renders the supplied local asset directly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${logo}`}
            alt="PROFI"
            width={326}
            height={109}
            style={{ position: "absolute", left: -42, top: -18 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.08,
              letterSpacing: -2,
              maxWidth: 1000,
              fontFamily: display,
              fontWeight: 600,
            }}
          >
            {HEADLINE}
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#a8a59d",
              maxWidth: 860,
              fontFamily: text,
              fontWeight: 500,
            }}
          >
            {SUBLINE}
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
            fontFamily: mono,
            fontWeight: 500,
          }}
        >
          {BADGE}
        </div>
      </div>
    ),
    // An empty `fonts` array would replace the built-in font and fail the
    // build, so it is only passed when at least one family loaded.
    fonts.length > 0 ? { ...size, fonts } : size,
  );
}
