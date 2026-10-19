/**
 * Mock data for the local mockup. Everything here is sample data per the
 * handoff ("do not ship the samples") and will be replaced by Drop / DropBox /
 * Box / Order / Customer / Settings records from the database.
 */

export type Locale = "en" | "ja";

/** Admin-set lifecycle state of a drop (PRD 5.2a). */
export type DropState = "draft" | "scheduled" | "open" | "closed" | "baking" | "shipped" | "complete" | "cancelled";

/** Which homepage variant to render (PRD 1.1). */
export type HomeState = "scheduled" | "open" | "closed" | "nodrop";

export interface Box {
  id: string;
  name: string;
  desc: string;
  contents: string;
  allergens: string[];
  /** Tax-inclusive price in JPY (D18). */
  price: number;
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
  /** As set by admin; see effectiveState() for the system transitions. */
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

/** The signed-in customer, if any (PRD 2.3 / 2.4 / 2.5). */
export interface Viewer {
  signedIn: boolean;
  /** Avatar letter for the nav. */
  initial: string;
  /** Customer.marketing_opt_in (PRD 2.4). */
  optedIn: boolean;
  /** Their order in the drop the hero is about, if any (PRD 1.1, closed state). */
  order: { number: string; dropId: string; boxCount: number } | null;
}

const JST = (iso: string) => new Date(iso + "+09:00");
const DAY = 86_400_000;

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
    id: "cookie-box",
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
    id: "banana-bread",
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
    id: "sampler-box",
    name: "Sampler Box",
    price: 900, // sample price; the real one is set in admin
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

/**
 * Sample timeline (DROP-STATES.md): Drop 03 closed on Oct 18 and ships Oct 25;
 * Drop 04 opens Sun Nov 8 at 10:00 JST and ships Nov 22. Both drops carry the
 * same three boxes until DropBox records exist.
 */
export const drops: Drop[] = [
  {
    id: "drop-03",
    number: 3,
    name: "Drop 03 · October",
    state: "open",
    openAt: JST("2026-10-11T12:00:00"),
    closeAt: JST("2026-10-18T21:00:00"),
    shipAt: JST("2026-10-25T00:00:00"),
    arriveAt: JST("2026-10-26T00:00:00"),
    boxes,
  },
  {
    id: "drop-04",
    number: 4,
    name: "Drop 04 · November",
    state: "scheduled",
    openAt: JST("2026-11-08T10:00:00"),
    closeAt: JST("2026-11-15T21:00:00"),
    shipAt: JST("2026-11-22T00:00:00"),
    arriveAt: JST("2026-11-23T00:00:00"),
    boxes,
  },
];

/** The drop the checkout flow and cart are built against (mock). */
export const drop: Drop = drops[0];

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

export const anonymousViewer: Viewer = { signedIn: false, initial: "", optedIn: false, order: null };

/** Sample signed-in viewer: opted in, ordered 2 boxes in Drop 03. */
export const sampleViewer: Viewer = {
  signedIn: true,
  initial: "H",
  optedIn: true,
  order: { number: sampleOrderNumber, dropId: "drop-03", boxCount: 2 },
};

/**
 * Applies the system transitions from PRD 5.2a to the admin-set state:
 * scheduled → open at open_at, open → closed at close_at, closed → shipped at
 * ship_at (standing in for the admin's tracking import), shipped → complete a
 * few days after arrival. Admin-only states (draft, cancelled) pass through.
 */
export function effectiveState(d: Drop, now: Date): DropState {
  const afterShip = (): DropState => (now.getTime() >= d.arriveAt.getTime() + 3 * DAY ? "complete" : "shipped");
  const afterOpen = (): DropState => (now < d.closeAt ? "open" : now < d.shipAt ? "closed" : afterShip());
  switch (d.state) {
    case "scheduled":
      return now < d.openAt ? "scheduled" : afterOpen();
    case "open":
      return afterOpen();
    case "closed":
    case "baking":
      return now < d.shipAt ? d.state : afterShip();
    case "shipped":
      return afterShip();
    default:
      return d.state;
  }
}

export interface HomeData {
  state: HomeState;
  /** The drop the hero is about: the current one, or null between drops. */
  drop: Drop | null;
  /** The next scheduled drop, shown on the closed page when there is one. */
  nextDrop: Drop | null;
  /** Boxes for section 1.3: the drop's boxes, or every active box between drops. */
  boxes: Box[];
  viewer: Viewer;
  settings: Settings;
}

/** Where getHome() reads from: the database in the app, the mocks above in tests and the checkout. */
export interface HomeSource {
  drops: Drop[];
  /** Active boxes, shown as "The menu" when no drop is scheduled. */
  catalogue: Box[];
  settings: Settings;
}

export const mockSource: HomeSource = { drops, catalogue: boxes, settings };

export interface HomeQuery {
  /** Demo override: "open" | "scheduled" | "closed" | "nodrop". */
  state?: string;
  /** With state=closed, "0" hides the next drop. */
  next?: string;
  /** "member" = signed in and opted in; "ordered" = member with an order in the closed drop. */
  viewer?: string;
  now?: Date;
}

/** Resolves what the homepage should show (PRD 1.1, 1.3, 1.5, 5.2a). */
export function getHome(q: HomeQuery = {}, src: HomeSource = mockSource): HomeData {
  const now = q.now ?? new Date();
  const viewer: Viewer =
    q.viewer === "ordered" ? sampleViewer : q.viewer === "member" ? { ...sampleViewer, order: null } : anonymousViewer;
  const { catalogue, settings } = src;
  const base = { viewer, settings };
  // Drafts and cancelled drops are never public, demo overrides included.
  const live = [...src.drops]
    .sort((a, b) => a.openAt.getTime() - b.openAt.getTime())
    .map((d) => ({ d, s: effectiveState(d, now) }))
    .filter(({ s }) => s !== "draft" && s !== "cancelled");
  const current = live.find(({ s }) => s === "open")?.d ?? null;
  const scheduled = live.find(({ s }) => s === "scheduled")?.d ?? null;
  const past = [...live].reverse().find(({ s }) => s === "closed" || s === "baking" || s === "shipped" || s === "complete")?.d ?? null;

  // Demo overrides so every state can be opened directly (see README).
  switch (q.state) {
    case "open": {
      const d = current ?? past ?? scheduled;
      if (d) return { ...base, state: "open", drop: d, nextDrop: null, boxes: d.boxes };
      break;
    }
    case "scheduled": {
      const d = scheduled ?? live.at(-1)?.d;
      if (d) return { ...base, state: "scheduled", drop: d, nextDrop: null, boxes: d.boxes };
      break;
    }
    case "closed": {
      const d = past ?? current ?? scheduled;
      if (d) {
        const next = q.next === "0" || scheduled === d ? null : scheduled;
        return { ...base, state: "closed", drop: d, nextDrop: next, boxes: next ? next.boxes : catalogue };
      }
      break;
    }
    case "nodrop":
      return { ...base, state: "nodrop", drop: null, nextDrop: null, boxes: catalogue };
  }

  // Otherwise read the state machine: the earliest unfinished drop is "current".
  const head = live.find(({ s }) => s !== "complete");
  if (!head) return { ...base, state: "nodrop", drop: null, nextDrop: null, boxes: catalogue };
  if (head.s === "scheduled") return { ...base, state: "scheduled", drop: head.d, nextDrop: null, boxes: head.d.boxes };
  if (head.s === "open") return { ...base, state: "open", drop: head.d, nextDrop: null, boxes: head.d.boxes };
  const next = live.find(({ d, s }) => s === "scheduled" && d.openAt > head.d.openAt)?.d ?? null;
  return { ...base, state: "closed", drop: head.d, nextDrop: next, boxes: next ? next.boxes : catalogue };
}

export function getBox(id: string): Box | undefined {
  return boxes.find((b) => b.id === id);
}
