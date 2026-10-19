/**
 * Mock data for the local mockup. Everything here is sample data per the
 * handoff ("do not ship the samples") and will be replaced by Drop / DropBox /
 * Box / Settings records from the database.
 */

export type Locale = "en" | "ja";
export type DropState = "scheduled" | "open" | "closed" | "none";

export interface Box {
  id: string;
  name: string;
  desc: string;
  contents: string;
  allergens: string[];
  /** Tax-inclusive price in JPY. null = not set yet (renders "¥[price]"). */
  price: number | null;
  /** Remaining = cap − sold − active holds (D8). */
  left: number;
  /** Per-customer limit for this drop (D7). */
  maxPerCustomer: number;
  tint: string;
  tilt: string;
}

export interface Drop {
  id: string;
  number: number;
  name: string;
  state: DropState;
  openAt: Date;
  closeAt: Date;
  shipAt: Date;
  arriveAt: Date;
  boxes: Box[];
}

export interface Settings {
  /** Flat shipping fee per order, tax-inclusive (D19). null renders "¥[fee]". */
  shippingFee: number | null;
  shippingArea: string;
  instagramUrl: string;
  lineUrl: string;
  contactEmail: string;
  /** Checkout hold TTL in minutes (D8). */
  holdMinutes: number;
}

const JST = (iso: string) => new Date(iso + "+09:00");

export const settings: Settings = {
  shippingFee: 800, // placeholder — final fee comes from Settings 4.9
  shippingArea: "Tokyo 23 wards",
  instagramUrl: "https://instagram.com",
  lineUrl: "#notify",
  contactEmail: "hello@astrobakes.example",
  holdMinutes: 10,
};

export const boxes: Box[] = [
  {
    id: "cookie",
    name: "4 Cookie Box",
    price: 1000,
    left: 7,
    maxPerCustomer: 5,
    tint: "var(--pink-soft)",
    tilt: "-1.2deg",
    desc: "All four signature cookies. Thick and soft in the middle.",
    contents:
      "1 American chocolate chip · 1 matcha white chocolate · 1 double chocolate & roasted walnut · 1 cookies & cream",
    allergens: ["Egg", "Milk", "Wheat", "Walnut"],
  },
  {
    id: "loaf",
    name: "Nebula Banana Bread",
    price: 500,
    left: 3,
    maxPerCustomer: 5,
    tint: "var(--butter-soft)",
    tilt: "1deg",
    desc: "A mini loaf, sweet from ripe bananas and very moist.",
    contents: "1 whole mini loaf",
    allergens: ["Egg", "Milk", "Wheat"],
  },
  {
    id: "sampler",
    name: "Sampler Box",
    price: null,
    left: 0,
    maxPerCustomer: 5,
    tint: "var(--lilac-tint)",
    tilt: "-0.8deg",
    desc: "A little of everything from this drop.",
    contents:
      "1 slice Nebula Banana Bread · 1 slice Midnight Chocolate Cake · 2 chocolate chip cookies",
    allergens: ["Egg", "Milk", "Wheat"],
  },
];

export const drop: Drop = {
  id: "drop-03",
  number: 3,
  name: "Drop 03 · October",
  state: "open",
  openAt: JST("2026-10-11T12:00:00"),
  closeAt: JST("2026-10-18T21:00:00"),
  shipAt: JST("2026-10-25T00:00:00"),
  arriveAt: JST("2026-10-26T00:00:00"),
  boxes,
};

/** Sample signed-in customer / saved address (PRD 2.3). */
export const sampleCustomer = {
  email: "you@example.com",
  name: "山田 花子",
  phone: "090-1234-5678",
  postalCode: "153-0061",
  prefecture: "東京都",
  city: "目黒区",
  town: "中目黒",
  wardEn: "Meguro-ku",
  line1: "1-2-3",
  line2: "",
};

export const sampleOrderNumber = "AB-003-017";

export function getBox(id: string): Box | undefined {
  return boxes.find((b) => b.id === id);
}
