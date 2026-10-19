import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { boxes as boxesTable, dropBoxes as dropBoxesTable, drops as dropsTable, settings as settingsTable, type BoxRow, type DropBoxRow } from "@/db/schema";
import { settings as defaultSettings, type Box, type Drop, type Locale, type Settings } from "./data";

/**
 * Server-side reads for the homepage (PRD 1.1, 1.3): drops with their boxes,
 * the active catalogue, and admin settings, mapped onto the view types the
 * components already use. Server components only; never import from the client.
 */

const DAY = 86_400_000;

/** Card colours and tilts are presentation, not data; cycle them by position. */
const PALETTE = [
  { tint: "var(--pink-soft)", tilt: "-1.2deg" },
  { tint: "var(--butter-soft)", tilt: "1deg" },
  { tint: "var(--lilac-tint)", tilt: "-0.8deg" },
  { tint: "var(--aqua-soft)", tilt: "0.9deg" },
];

/** JA copy falls back to EN until it exists (D2). */
const pick = (locale: Locale, en: string | null, ja: string | null) => (locale === "ja" && ja) || en || "";

function toBox(box: BoxRow, locale: Locale, i: number, inDrop?: Pick<DropBoxRow, "cap" | "soldQty" | "maxPerCustomer" | "price">): Box {
  const p = PALETTE[i % PALETTE.length];
  return {
    id: box.slug,
    name: pick(locale, box.nameEn, box.nameJa),
    desc: pick(locale, box.descriptionEn, box.descriptionJa),
    contents: pick(locale, box.contentsEn, box.contentsJa),
    allergens: box.allergens,
    price: inDrop?.price ?? box.price,
    // remaining = cap − sold − active holds (D8); holds arrive with the checkout wiring
    left: inDrop ? Math.max(0, inDrop.cap - inDrop.soldQty) : box.defaultCap,
    maxPerCustomer: inDrop?.maxPerCustomer ?? box.defaultMaxPerCustomer,
    tint: p.tint,
    tilt: p.tilt,
  };
}

/** Every drop, oldest first, with its boxes. Arrival is ship date + 1 (D21). */
export async function loadDrops(locale: Locale): Promise<Drop[]> {
  const rows = await getDb().query.drops.findMany({
    orderBy: [asc(dropsTable.openAt)],
    with: { dropBoxes: { orderBy: [asc(dropBoxesTable.sort)], with: { box: true } } },
  });
  return rows.map((d) => ({
    id: d.slug,
    number: d.number,
    name: pick(locale, d.nameEn, d.nameJa),
    state: d.state,
    openAt: d.openAt,
    closeAt: d.closeAt,
    shipAt: d.shipAt,
    arriveAt: new Date(d.shipAt.getTime() + DAY),
    boxes: d.dropBoxes.map((db, i) => toBox(db.box, locale, i, db)),
  }));
}

/** Active boxes, for "The menu" when no drop is scheduled (PRD 1.3 open question). */
export async function loadCatalogue(locale: Locale): Promise<Box[]> {
  const rows = await getDb().select().from(boxesTable).where(eq(boxesTable.active, true)).orderBy(asc(boxesTable.sort));
  return rows.map((b, i) => toBox(b, locale, i));
}

/** Admin settings (PRD 4.9) over the code defaults, so a missing key never breaks a page. */
export async function loadSettings(): Promise<Settings> {
  const rows = await getDb().select().from(settingsTable);
  const kv = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const num = (k: string, d: number | null) => (typeof kv[k] === "number" ? (kv[k] as number) : d);
  const str = (k: string, d: string) => (typeof kv[k] === "string" ? (kv[k] as string) : d);
  return {
    shippingFee: num("shipping_fee", defaultSettings.shippingFee),
    shippingArea: str("shipping_area", defaultSettings.shippingArea),
    instagramUrl: str("instagram_url", defaultSettings.instagramUrl),
    lineUrl: str("line_url", defaultSettings.lineUrl),
    contactEmail: str("contact_email", defaultSettings.contactEmail),
    holdMinutes: num("hold_minutes", defaultSettings.holdMinutes) ?? defaultSettings.holdMinutes,
  };
}
