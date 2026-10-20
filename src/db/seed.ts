/**
 * Seeds the sample data from the design handoff so the site has something to
 * render: the catalogue, Drop 03 (October) and Drop 04 (November), the admin
 * settings placeholders, and one sample customer with a saved address.
 * Idempotent: catalogue rows upsert by slug, settings are only inserted if
 * missing (so admin edits survive a re-seed).
 *
 *   pnpm db:seed   (src/db/seed-cli.ts)
 */
import { eq } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";

const JST = (iso: string) => new Date(iso + "+09:00");

const SETTINGS: { key: string; value: unknown }[] = [
  { key: "shipping_fee", value: 800 }, // placeholder until the owner sets it (PRD 4.9)
  { key: "shipping_area", value: "Tokyo 23 wards" },
  { key: "instagram_url", value: "https://instagram.com" },
  { key: "line_url", value: "#notify" },
  { key: "contact_email", value: "hello@astrobakes.xyz" },
  { key: "hold_minutes", value: 10 },
];

const ITEMS = [
  { slug: "cookie-american-choc-chip", nameEn: "American chocolate chip cookie", nameJa: "アメリカンチョコチップクッキー", productionUnit: "cookie" },
  { slug: "cookie-matcha-white-choc", nameEn: "Matcha white chocolate cookie", nameJa: "抹茶ホワイトチョコクッキー", productionUnit: "cookie" },
  { slug: "cookie-double-choc-walnut", nameEn: "Double chocolate & roasted walnut cookie", nameJa: "ダブルチョコ＆ローストくるみクッキー", productionUnit: "cookie" },
  { slug: "cookie-cookies-and-cream", nameEn: "Cookies & cream cookie", nameJa: "クッキー＆クリームクッキー", productionUnit: "cookie" },
  { slug: "banana-bread-mini-loaf", nameEn: "Nebula Banana Bread, mini loaf", nameJa: "ネビュラ・バナナブレッド（ミニローフ）", productionUnit: "mini loaf" },
  { slug: "banana-bread-slice", nameEn: "Nebula Banana Bread, slice", nameJa: "ネビュラ・バナナブレッド（スライス）", productionUnit: "mini loaf", unitsPerProductionUnit: 6 },
  { slug: "midnight-choc-cake-slice", nameEn: "Midnight Chocolate Cake, slice", nameJa: "ミッドナイト・チョコレートケーキ（スライス）", productionUnit: "cake", unitsPerProductionUnit: 12 },
];

const BOXES = [
  {
    slug: "cookie-box",
    nameEn: "4 Cookie Box",
    nameJa: "4種のクッキーボックス",
    descriptionEn: "All four signature cookies. Thick and soft in the middle.",
    descriptionJa: "看板クッキー4種の詰め合わせ。厚焼きで、真ん中はしっとりやわらか。",
    contentsEn: "1 American chocolate chip · 1 matcha white chocolate · 1 double chocolate & roasted walnut · 1 cookies & cream",
    contentsJa: "アメリカンチョコチップ 1枚 · 抹茶ホワイトチョコ 1枚 · ダブルチョコ＆ローストくるみ 1枚 · クッキー＆クリーム 1枚",
    price: 1000,
    allergens: ["Egg", "Milk", "Wheat", "Walnut"],
    photos: ["/images/boxes/cookie-box.jpg"],
    defaultCap: 20,
    sort: 0,
    items: [["cookie-american-choc-chip", 1], ["cookie-matcha-white-choc", 1], ["cookie-double-choc-walnut", 1], ["cookie-cookies-and-cream", 1]] as const,
  },
  {
    slug: "banana-bread",
    nameEn: "Nebula Banana Bread",
    nameJa: "ネビュラ・バナナブレッド",
    descriptionEn: "A mini loaf, sweet from ripe bananas and very moist.",
    descriptionJa: "完熟バナナの甘さが広がる、とてもしっとりしたミニローフ。",
    contentsEn: "1 whole mini loaf",
    contentsJa: "ミニローフ 1本",
    price: 500,
    allergens: ["Egg", "Milk", "Wheat"],
    defaultCap: 10,
    sort: 1,
    items: [["banana-bread-mini-loaf", 1]] as const,
  },
  {
    slug: "sampler-box",
    nameEn: "Sampler Box",
    nameJa: "サンプラーボックス",
    descriptionEn: "A little of everything from this drop.",
    descriptionJa: "今回のドロップを少しずつ楽しめる詰め合わせ。",
    contentsEn: "1 slice Nebula Banana Bread · 1 slice Midnight Chocolate Cake · 2 chocolate chip cookies",
    contentsJa: "ネビュラ・バナナブレッド 1切れ · ミッドナイト・チョコレートケーキ 1切れ · チョコチップクッキー 2枚",
    price: 900, // sample price; the owner sets the real one in admin (PRD 4.3)
    allergens: ["Egg", "Milk", "Wheat"],
    defaultCap: 10,
    sort: 2,
    items: [["banana-bread-slice", 1], ["midnight-choc-cake-slice", 1], ["cookie-american-choc-chip", 2]] as const,
  },
];

/** Sample timeline from design-ref/DROP-STATES.md. sold counts give "7 left", "3 left", sold out. */
const DROPS = [
  {
    number: 3,
    slug: "drop-03",
    nameEn: "Drop 03 · October",
    nameJa: "ドロップ03 · 10月",
    state: "open" as const,
    openAt: JST("2026-10-11T12:00:00"),
    closeAt: JST("2026-10-18T21:00:00"),
    bakeAt: JST("2026-10-24T06:00:00"),
    shipAt: JST("2026-10-25T00:00:00"),
    boxes: { "cookie-box": { cap: 20, sold: 13 }, "banana-bread": { cap: 10, sold: 7 }, "sampler-box": { cap: 10, sold: 10 } },
  },
  {
    number: 4,
    slug: "drop-04",
    nameEn: "Drop 04 · November",
    nameJa: "ドロップ04 · 11月",
    state: "scheduled" as const,
    openAt: JST("2026-11-08T10:00:00"),
    closeAt: JST("2026-11-15T21:00:00"),
    bakeAt: JST("2026-11-21T06:00:00"),
    shipAt: JST("2026-11-22T00:00:00"),
    boxes: { "cookie-box": { cap: 20, sold: 0 }, "banana-bread": { cap: 10, sold: 0 }, "sampler-box": { cap: 10, sold: 0 } },
  },
];

export async function seed(db: Db) {
  const now = new Date();

  for (const s of SETTINGS) await db.insert(schema.settings).values(s).onConflictDoNothing();

  const itemIds = new Map<string, string>();
  for (const it of ITEMS) {
    const [row] = await db
      .insert(schema.items)
      .values(it)
      .onConflictDoUpdate({ target: schema.items.slug, set: { ...it, updatedAt: now } })
      .returning({ id: schema.items.id });
    itemIds.set(it.slug, row.id);
  }

  const boxIds = new Map<string, string>();
  const boxPrice = new Map<string, number>();
  for (const { items, ...box } of BOXES) {
    const [row] = await db
      .insert(schema.boxes)
      .values(box)
      .onConflictDoUpdate({ target: schema.boxes.slug, set: { ...box, updatedAt: now } })
      .returning({ id: schema.boxes.id });
    boxIds.set(box.slug, row.id);
    boxPrice.set(box.slug, box.price);
    await db.delete(schema.boxItems).where(eq(schema.boxItems.boxId, row.id));
    await db.insert(schema.boxItems).values(items.map(([slug, qty]) => ({ boxId: row.id, itemId: itemIds.get(slug)!, qty })));
  }

  for (const { boxes, ...drop } of DROPS) {
    const [row] = await db
      .insert(schema.drops)
      .values(drop)
      .onConflictDoUpdate({ target: schema.drops.number, set: { ...drop, updatedAt: now } })
      .returning({ id: schema.drops.id });
    let sort = 0;
    for (const [slug, { cap, sold }] of Object.entries(boxes)) {
      const values = { dropId: row.id, boxId: boxIds.get(slug)!, cap, soldQty: sold, price: boxPrice.get(slug)!, sort: sort++ };
      await db
        .insert(schema.dropBoxes)
        .values(values)
        .onConflictDoUpdate({ target: [schema.dropBoxes.dropId, schema.dropBoxes.boxId], set: values });
    }
  }

  // Sample customer with a saved address (PRD 2.3); used by the checkout prefill and the ?viewer= demo.
  const customer = { email: "you@example.com", name: "山田 花子", phone: "090-1234-5678", locale: "en" as const, emailVerifiedAt: now };
  const [c] = await db
    .insert(schema.customers)
    .values(customer)
    .onConflictDoUpdate({ target: schema.customers.email, set: { ...customer, updatedAt: now } })
    .returning({ id: schema.customers.id });
  const address = { customerId: c.id, postalCode: "1530061", prefecture: "東京都", city: "目黒区", town: "中目黒", line1: "1-2-3", wardCode: "13110" };
  await db
    .insert(schema.addresses)
    .values(address)
    .onConflictDoUpdate({ target: schema.addresses.customerId, set: { ...address, updatedAt: now } });

  const counts = {
    settings: SETTINGS.length,
    items: ITEMS.length,
    boxes: BOXES.length,
    drops: DROPS.length,
    customers: 1,
  };
  return counts;
}
