import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { stringsFor } from "@/lib/metadata";

/**
 * The link preview card for Instagram, LINE and X (1200×630), one per language.
 * Built at deploy time; colours are the tokens in globals.css (no CSS variables here).
 */
const INK = "#2a1b5e";
const LILAC = "#cdb4ff";
const PURPLE = "#b14fe0";
const AQUA = "#7de8e4";
const STAR = "M24 2 l6.2 13.4 14.6 1.8 -10.8 10 2.9 14.5 -12.9 -7.3 -12.9 7.3 2.9 -14.5 -10.8 -10 14.6 -1.8z";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return [{ id: "card", alt: stringsFor(locale).ogImageAlt, size, contentType }];
}

/** A TTF holding just the glyphs in `text`. The renderer can't read woff2, and a full Japanese font is several MB. */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error(`Google Fonts returned no TTF for ${family} ${weight}`);
  return (await fetch(src)).arrayBuffer();
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = stringsFor(locale);
  const ja = locale === "ja";
  const [logoFont, headlineFont, photo] = await Promise.all([
    googleFont("Pacifico", 400, "Astro Bakes"),
    // Titan One has no Japanese glyphs; the site switches JA display type to Zen Maru Gothic 900 the same way.
    ja ? googleFont("Zen Maru Gothic", 900, t.heroTitleA + t.heroTitleB) : googleFont("Titan One", 400, t.heroTitleA + t.heroTitleB),
    readFile(join(process.cwd(), "public/images/boxes/cookie-box.jpg")),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 40, padding: "0 64px", background: LILAC, color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 40, flex: 1 }}>
          <div
            style={{
              display: "flex", padding: "0 40px 14px", background: "#fff", border: `5px solid ${INK}`, borderRadius: 999,
              boxShadow: `6px 6px 0 ${INK}`, transform: "rotate(-4deg)", fontFamily: "Logo", fontSize: 60, color: PURPLE,
            }}
          >
            Astro Bakes
          </div>
          {/* Japanese doesn't wrap at spaces, so each half is sized to fit one line (12 characters). */}
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Headline", fontWeight: ja ? 900 : 400, fontSize: ja ? 48 : 66, lineHeight: 1.15 }}>
            <span>{t.heroTitleA.trim()}</span>
            <span>{t.heroTitleB}</span>
          </div>
        </div>
        <div style={{ display: "flex", position: "relative" }}>
          <div style={{ display: "flex", padding: 14, background: "#fff", border: `5px solid ${INK}`, borderRadius: 10, boxShadow: `10px 10px 0 ${INK}`, transform: "rotate(3deg)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${photo.toString("base64")}`} alt="" width={400} height={400} style={{ objectFit: "cover", borderRadius: 4 }} />
          </div>
          <svg viewBox="0 0 48 48" width={96} height={96} style={{ position: "absolute", top: -40, right: -36 }}>
            <path d={STAR} fill={AQUA} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Logo", data: logoFont, weight: 400, style: "normal" },
        { name: "Headline", data: headlineFont, weight: ja ? 900 : 400, style: "normal" },
      ],
    },
  );
}
