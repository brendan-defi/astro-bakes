import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { stringsFor } from "@/lib/metadata";

/**
 * The link preview card for Instagram, LINE and X (1200×630), one per language.
 * LINE shows only a small square cut from the middle, so everything that matters
 * (the photo and the logo) sits in the central 630×630 and the sides are decoration.
 * Words aren't needed in the image: every app prints the title and description beside it.
 * Built at deploy time; colours are the tokens in globals.css (no CSS variables here).
 */
const INK = "#2a1b5e";
const LILAC = "#cdb4ff";
const PURPLE = "#b14fe0";
const AQUA = "#7de8e4";
const PINK = "#ff9ccb";
const BUTTER = "#ffe066";
const STAR = "M24 2 l6.2 13.4 14.6 1.8 -10.8 10 2.9 14.5 -12.9 -7.3 -12.9 7.3 2.9 -14.5 -10.8 -10 14.6 -1.8z";

/** Photo frame size, how far to crop in, and where (0–1 across the spare width and height). */
const PHOTO = 470;
const ZOOM = 1.35;
const FOCUS = [0.45, 0.6];

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return [{ id: "card", alt: stringsFor(locale).ogImageAlt, size, contentType }];
}

/** A TTF holding just the glyphs in `text` (the renderer can't read woff2). */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error(`Google Fonts returned no TTF for ${family} ${weight}`);
  return (await fetch(src)).arrayBuffer();
}

function Star({ fill, size, x, y, rotate = 0 }: { fill: string; size: number; x: number; y: number; rotate?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ position: "absolute", left: x, top: y, transform: `rotate(${rotate}deg)` }}>
      <path d={STAR} fill={fill} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
}

/** CookieShape from components/icons.tsx, with literal colours. */
function Cookie({ size, x, y, rotate = 0 }: { size: number; x: number; y: number; rotate?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ position: "absolute", left: x, top: y, transform: `rotate(${rotate}deg)` }}>
      <circle cx="32" cy="32" r="28" fill="#E8B56A" stroke={INK} strokeWidth="4" />
      <circle cx="22" cy="24" r="5" fill="#6B3E26" />
      <circle cx="40" cy="20" r="4" fill="#6B3E26" />
      <circle cx="43" cy="38" r="5.5" fill="#6B3E26" />
      <circle cx="26" cy="43" r="4.5" fill="#6B3E26" />
      <circle cx="32" cy="31" r="3" fill="#6B3E26" />
    </svg>
  );
}

export default async function Image() {
  const [logoFont, photo] = await Promise.all([
    googleFont("Pacifico", 400, "Astro Bakes"),
    readFile(join(process.cwd(), "public/images/boxes/cookie-box.jpg")),
  ]);

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: LILAC }}>
        {/* Sides: outside LINE's square crop (x 285–915). */}
        <Star fill={AQUA} size={150} x={70} y={70} rotate={-12} />
        <Star fill={BUTTER} size={64} x={200} y={250} rotate={14} />
        <Cookie size={170} x={60} y={380} rotate={-10} />
        <Star fill={PINK} size={130} x={990} y={400} rotate={10} />
        <Star fill={AQUA} size={70} x={960} y={110} rotate={-8} />
        <Cookie size={120} x={1030} y={180} rotate={18} />

        {/* Middle: the photo in a polaroid, the logo sticker across its bottom edge. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", padding: 16, background: "#fff", border: `5px solid ${INK}`, borderRadius: 10, boxShadow: `10px 10px 0 ${INK}`, transform: "rotate(-2deg)" }}>
            {/* Cropped in on the cookies so they still read in LINE's thumbnail. */}
            <div style={{ display: "flex", width: PHOTO, height: PHOTO, overflow: "hidden", borderRadius: 4 }}>
              <img src={`data:image/jpeg;base64,${photo.toString("base64")}`} alt="" width={PHOTO * ZOOM} height={PHOTO * ZOOM} style={{ marginLeft: -PHOTO * (ZOOM - 1) * FOCUS[0], marginTop: -PHOTO * (ZOOM - 1) * FOCUS[1] }} />
            </div>
          </div>
          <div
            style={{
              display: "flex", marginTop: -58, padding: "0 44px 16px", background: "#fff", border: `5px solid ${INK}`, borderRadius: 999,
              boxShadow: `6px 6px 0 ${INK}`, transform: "rotate(-4deg)", fontFamily: "Logo", fontSize: 68, color: PURPLE,
            }}
          >
            Astro Bakes
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Logo", data: logoFont, weight: 400, style: "normal" }] },
  );
}
